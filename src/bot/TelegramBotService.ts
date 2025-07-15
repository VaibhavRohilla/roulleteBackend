import TelegramBot from 'node-telegram-bot-api';
import { CONFIG } from '../config/config';
import { Logger } from '../utils/Logger';
import { SupabaseService } from '../services/SupabaseService';
import { GameStateManager, GameState } from '../services/GameStateManager';

export const spinQueue: number[] = [];

export class TelegramBotService {
  public bot: TelegramBot;
  private auditService: SupabaseService;
  private gameStateManager: GameStateManager;

  constructor() {
    this.bot = new TelegramBot(CONFIG.TELEGRAM_BOT_TOKEN, { polling: true });
    this.auditService = SupabaseService.getInstance();
    this.gameStateManager = GameStateManager.getInstance();
    this.setupHandlers();
    this.logBotStart();
  }

  private isAdmin(userId: number): boolean {
    return CONFIG.ADMINS.includes(userId);
  }

  private setupHandlers() {
    // Add spin to queue
    this.bot.onText(/spin\s*:\s*(\d+)/i, async (msg, match) => {
      const userId = msg.from!.id;
      const username = msg.from?.username || msg.from?.first_name || 'Unknown';
      const index = parseInt(match![1]);

      if (!this.isAdmin(userId)) {
        Logger.warn(`🚨 Unauthorized spin from ${username} (${userId}): ${msg.text}`);
        this.bot.sendMessage(msg.chat.id, '❌ Not authorized.');
        await this.logAction(userId, username, 'add_spin_unauthorized', `Attempted to add spin: ${index}`, null, null, false);
        return;
      }

      if (index < 0 || index > 36) {
        this.bot.sendMessage(msg.chat.id, '❌ Invalid spin number. Use 0-36.');
        await this.logAction(userId, username, 'add_spin_invalid', `Invalid spin number: ${index}`, null, null, false);
        return;
      }

      const oldQueue = [...spinQueue];
      spinQueue.push(index);
      this.bot.sendMessage(msg.chat.id, `✅ Queued spin: ${index}`);
      await this.logAction(userId, username, 'add_spin', `Added spin: ${index}`, oldQueue, [...spinQueue], true);
    });

    // Game Status
    this.bot.onText(/\/status/, async (msg) => {
      const userId = msg.from!.id;
      const username = msg.from?.username || msg.from?.first_name || 'Unknown';
      
      if (!this.isAdmin(userId)) return;
      
      const statusMessage = this.gameStateManager.getStatusMessage();
      this.bot.sendMessage(msg.chat.id, statusMessage);
      await this.logAction(userId, username, 'check_status', 'Checked game status', null, null, true);
    });

    // Clear queue (legacy command - kept for compatibility)
    this.bot.onText(/\/clear/, async (msg) => {
      await this.handleDeleteQueue(msg);
    });

    // Delete entire queue
    this.bot.onText(/\/delete_queue/, async (msg) => {
      await this.handleDeleteQueue(msg);
    });

    // Delete specific value from queue
    this.bot.onText(/\/delete\s+(\d+)/, async (msg, match) => {
      const userId = msg.from!.id;
      const username = msg.from?.username || msg.from?.first_name || 'Unknown';
      const valueToDelete = parseInt(match![1]);

      if (!this.isAdmin(userId)) return;

      const oldQueue = [...spinQueue];
      const initialLength = spinQueue.length;
      
      // Remove all instances of the value
      for (let i = spinQueue.length - 1; i >= 0; i--) {
        if (spinQueue[i] === valueToDelete) {
          spinQueue.splice(i, 1);
        }
      }

      const deletedCount = initialLength - spinQueue.length;
      if (deletedCount > 0) {
        this.bot.sendMessage(msg.chat.id, `🗑️ Deleted ${deletedCount} instance(s) of ${valueToDelete} from queue.`);
        await this.logAction(userId, username, 'delete_value', `Deleted value: ${valueToDelete} (${deletedCount} instances)`, oldQueue, [...spinQueue], true);
      } else {
        this.bot.sendMessage(msg.chat.id, `❌ Value ${valueToDelete} not found in queue.`);
        await this.logAction(userId, username, 'delete_value_not_found', `Value not found: ${valueToDelete}`, oldQueue, [...spinQueue], false);
      }
    });

    // Resume game
    this.bot.onText(/\/resume/, async (msg) => {
      const userId = msg.from!.id;
      const username = msg.from?.username || msg.from?.first_name || 'Unknown';

      if (!this.isAdmin(userId)) return;

      const success = this.gameStateManager.resume();
      if (success) {
        this.bot.sendMessage(msg.chat.id, '▶️ Game resumed.');
        await this.logAction(userId, username, 'resume_game', 'Game resumed', null, GameState.RUNNING, true);
      } else {
        this.bot.sendMessage(msg.chat.id, '❌ Game is already running.');
        await this.logAction(userId, username, 'resume_game_failed', 'Game already running', null, this.gameStateManager.getState(), false);
      }
    });

    // Pause/Stop game
    this.bot.onText(/\/stop/, async (msg) => {
      const userId = msg.from!.id;
      const username = msg.from?.username || msg.from?.first_name || 'Unknown';

      if (!this.isAdmin(userId)) return;

      const oldState = this.gameStateManager.getState();
      const success = this.gameStateManager.pause();
      if (success) {
        this.bot.sendMessage(msg.chat.id, '⏸️ Game paused.');
        await this.logAction(userId, username, 'pause_game', 'Game paused', oldState, GameState.PAUSED, true);
      } else {
        this.bot.sendMessage(msg.chat.id, '❌ Game is already paused.');
        await this.logAction(userId, username, 'pause_game_failed', 'Game already paused', oldState, this.gameStateManager.getState(), false);
      }
    });

    // Reset everything
    this.bot.onText(/\/reset/, async (msg) => {
      const userId = msg.from!.id;
      const username = msg.from?.username || msg.from?.first_name || 'Unknown';

      if (!this.isAdmin(userId)) return;

      const oldQueue = [...spinQueue];
      const oldState = this.gameStateManager.getState();
      
      this.gameStateManager.reset();
      this.bot.sendMessage(msg.chat.id, '🔄 Game reset: Queue cleared and game resumed.');
      await this.logAction(userId, username, 'reset_game', 'Full game reset', { queue: oldQueue, state: oldState }, { queue: [], state: GameState.RUNNING }, true);
    });

    // Help command
    this.bot.onText(/\/help/, async (msg) => {
      const userId = msg.from!.id;
      const username = msg.from?.username || msg.from?.first_name || 'Unknown';

      if (!this.isAdmin(userId)) {
        this.bot.sendMessage(msg.chat.id, '❌ Not authorized.');
        return;
      }

      const helpMessage = `🎰 ROULETTE BOT COMMANDS:

📋 QUEUE MANAGEMENT:
• \`spin: <0-36>\` - Add number to spin queue
• \`/status\` - Show game status and queue
• \`/delete_queue\` - Clear entire queue
• \`/delete <number>\` - Remove specific number from queue

🎮 GAME CONTROL:
• \`/resume\` - Resume paused game
• \`/stop\` - Pause game rounds
• \`/reset\` - Reset queue and resume game

ℹ️ INFO:
• \`/help\` - Show this help message
• Only admins can use these commands
• All actions are logged for audit`;

      this.bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'Markdown' });
      await this.logAction(userId, username, 'help_requested', 'Viewed help message', null, null, true);
    });

    console.log('🤖 Telegram bot handlers configured');
  }

  /**
   * Handle delete queue command
   */
  private async handleDeleteQueue(msg: any): Promise<void> {
    const userId = msg.from!.id;
    const username = msg.from?.username || msg.from?.first_name || 'Unknown';

    if (!this.isAdmin(userId)) return;

    const oldQueue = [...spinQueue];
    spinQueue.length = 0;
    this.bot.sendMessage(msg.chat.id, '🗑️ Queue cleared.');
    await this.logAction(userId, username, 'clear_queue', 'Queue cleared', oldQueue, [], true);
  }

  /**
   * Log bot startup
   */
  private async logBotStart(): Promise<void> {
    console.log('🤖 Telegram Bot Service started');
    await this.logAction(0, 'System', 'bot_start', 'Telegram bot service started', null, null, true);
  }

  /**
   * Log action to audit system
   */
  private async logAction(
    userId: number,
    username: string,
    action: string,
    details: string,
    oldValue: any,
    newValue: any,
    success: boolean
  ): Promise<void> {
    await this.auditService.logAction({
      user_id: userId,
      username,
      action,
      details,
      old_value: oldValue,
      new_value: newValue,
      success
    });
  }
}
