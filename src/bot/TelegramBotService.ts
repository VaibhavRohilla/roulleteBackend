import TelegramBot from 'node-telegram-bot-api';
import { CONFIG } from '../config/config';
import { Logger } from '../utils/Logger';
import { SupabaseService } from '../services/SupabaseService';
import { GameStateManager, GameState, GameStateResponse } from '../services/GameStateManager';
import { TimeUtils } from '../utils/TimeUtils';
import { isValidRouletteNumber } from '../utils/RouletteUtils';

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
        this.bot.sendMessage(msg.chat.id, `❌ **Not Authorized**\n\nUser: @${username}\nAction: Add spin ${index}\nStatus: DENIED\n\nOnly authorized admins can control the roulette.`);
        await this.logAction(userId, username, 'add_spin_unauthorized', `Attempted to add spin: ${index}`, null, null, false);
        return;
      }

      if (!isValidRouletteNumber(index)) {
        this.bot.sendMessage(msg.chat.id, `❌ **Invalid Spin Number**\n\nInput: ${index}\nValid Range: 0-36\nUser: @${username}\n\nPlease use a number between 0 and 36 for European Roulette.`);
        await this.logAction(userId, username, 'add_spin_invalid', `Invalid spin number: ${index}`, null, null, false);
        return;
      }

      const oldQueue = [...spinQueue];
      spinQueue.push(index);
      const gameState = this.gameStateManager.getGameStateResponse();
      
      // If game is idle (no active round, no spinning), start a new round
      if (!gameState.roundActive && !gameState.isSpinning && this.gameStateManager.isRunning()) {
        console.log('🚀 Game was idle, starting new round due to queued spin');
        this.gameStateManager.startNewRound();
      }
      
      this.bot.sendMessage(msg.chat.id, `✅ **Spin Queued Successfully**\n\n🎯 Number: ${index}\n👤 Added by: @${username}\n📋 Queue Position: ${spinQueue.length}\n📊 Total in Queue: ${spinQueue.length}\n🎮 Game State: ${gameState.roundActive ? '🎯 Round Active' : gameState.isSpinning ? '🎰 Spinning' : '💤 Idle'}\n\n⏰ ${TimeUtils.getIndianTimeString()}`);
      await this.logAction(userId, username, 'add_spin', `Added spin: ${index}`, oldQueue, [...spinQueue], true);
    });

    // Game Status
    this.bot.onText(/\/status/, async (msg) => {
      const userId = msg.from!.id;
      const username = msg.from?.username || msg.from?.first_name || 'Unknown';
      
      if (!this.isAdmin(userId)) {
        this.bot.sendMessage(msg.chat.id, `❌ **Access Denied**\n\nUser: @${username}\nCommand: /status\nStatus: UNAUTHORIZED\n\nOnly admins can view game status.`);
        return;
      }
      
      const gameState = this.gameStateManager.getGameStateResponse();
      const statusMessage = `📊 **ROULETTE GAME STATUS**\n\n` +
        `🎮 Game State: ${this.gameStateManager.getState().toUpperCase()}\n` +
        `🎯 Round Active: ${gameState.roundActive ? 'YES' : 'NO'}\n` +
        `🎰 Currently Spinning: ${gameState.isSpinning ? 'YES' : 'NO'}\n` +
        `📋 Queue Length: ${spinQueue.length} spins\n` +
        `📝 Queued Numbers: [${spinQueue.join(', ') || 'empty'}]\n` +
        `⏰ Round Duration: ${gameState.roundDuration || 0}ms\n` +
        `🕒 Last Update: ${TimeUtils.getIndianTimeString()}\n` +
        `👤 Requested by: @${username}`;
        
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

      if (!this.isAdmin(userId)) {
        this.bot.sendMessage(msg.chat.id, `❌ **Access Denied**\n\nUser: @${username}\nCommand: /delete ${valueToDelete}\nStatus: UNAUTHORIZED\n\nOnly admins can modify the queue.`);
        return;
      }

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
        this.bot.sendMessage(msg.chat.id, `✅ **Value Deleted Successfully**\n\n🎯 Number: ${valueToDelete}\n🗑️ Instances Removed: ${deletedCount}\n📋 Queue Length: ${initialLength} → ${spinQueue.length}\n📝 Remaining Queue: [${spinQueue.join(', ') || 'empty'}]\n👤 Deleted by: @${username}\n⏰ ${TimeUtils.getIndianTimeString()}`);
        await this.logAction(userId, username, 'delete_value', `Deleted value: ${valueToDelete} (${deletedCount} instances)`, oldQueue, [...spinQueue], true);
      } else {
        this.bot.sendMessage(msg.chat.id, `❌ **Value Not Found**\n\n🎯 Number: ${valueToDelete}\n📋 Current Queue: [${spinQueue.join(', ') || 'empty'}]\n📊 Queue Length: ${spinQueue.length}\n👤 Attempted by: @${username}\n\nThe number ${valueToDelete} was not found in the queue.`);
        await this.logAction(userId, username, 'delete_value_not_found', `Value not found: ${valueToDelete}`, oldQueue, [...spinQueue], false);
      }
    });

    // Resume game
    this.bot.onText(/\/resume/, async (msg) => {
      const userId = msg.from!.id;
      const username = msg.from?.username || msg.from?.first_name || 'Unknown';

      if (!this.isAdmin(userId)) {
        this.bot.sendMessage(msg.chat.id, `❌ **Access Denied**\n\nUser: @${username}\nCommand: /resume\nStatus: UNAUTHORIZED\n\nOnly admins can control game state.`);
        return;
      }

      const oldState = this.gameStateManager.getState();
      const success = this.gameStateManager.resume();
      if (success) {
        const gameState = this.gameStateManager.getGameStateResponse();
        this.bot.sendMessage(msg.chat.id, `✅ **Game Resumed Successfully**\n\n▶️ Status: RUNNING\n🎮 Previous State: ${oldState.toUpperCase()}\n📋 Queue Length: ${spinQueue.length}\n🎯 Round Active: ${gameState.roundActive ? 'YES' : 'NO'}\n👤 Resumed by: @${username}\n⏰ ${TimeUtils.getIndianTimeString()}`);
        await this.logAction(userId, username, 'resume_game', 'Game resumed', oldState, GameState.RUNNING, true);
      } else {
        this.bot.sendMessage(msg.chat.id, `❌ **Resume Failed**\n\n🎮 Current State: ${oldState.toUpperCase()}\n📝 Reason: Game is already running\n👤 Attempted by: @${username}\n\nThe game is already in running state.`);
        await this.logAction(userId, username, 'resume_game_failed', 'Game already running', oldState, this.gameStateManager.getState(), false);
      }
    });

    // Pause/Stop game
    this.bot.onText(/\/stop/, async (msg) => {
      const userId = msg.from!.id;
      const username = msg.from?.username || msg.from?.first_name || 'Unknown';

      if (!this.isAdmin(userId)) {
        this.bot.sendMessage(msg.chat.id, `❌ **Access Denied**\n\nUser: @${username}\nCommand: /stop\nStatus: UNAUTHORIZED\n\nOnly admins can control game state.`);
        return;
      }

      const oldState = this.gameStateManager.getState();
      const success = this.gameStateManager.pause();
      if (success) {
        const gameState = this.gameStateManager.getGameStateResponse();
        this.bot.sendMessage(msg.chat.id, `✅ **Game Paused Successfully**\n\n⏸️ Status: PAUSED\n🎮 Previous State: ${oldState.toUpperCase()}\n📋 Queue Length: ${spinQueue.length}\n🎯 Round Active: ${gameState.roundActive ? 'YES' : 'NO'}\n👤 Paused by: @${username}\n⏰ ${TimeUtils.getIndianTimeString()}\n\nUse /resume to continue the game.`);
        await this.logAction(userId, username, 'pause_game', 'Game paused', oldState, GameState.PAUSED, true);
      } else {
        this.bot.sendMessage(msg.chat.id, `❌ **Pause Failed**\n\n🎮 Current State: ${oldState.toUpperCase()}\n📝 Reason: Game is already paused\n👤 Attempted by: @${username}\n\nThe game is already in paused state.`);
        await this.logAction(userId, username, 'pause_game_failed', 'Game already paused', oldState, this.gameStateManager.getState(), false);
      }
    });

    // Reset everything
    this.bot.onText(/\/reset/, async (msg) => {
      const userId = msg.from!.id;
      const username = msg.from?.username || msg.from?.first_name || 'Unknown';

      if (!this.isAdmin(userId)) {
        this.bot.sendMessage(msg.chat.id, `❌ **Access Denied**\n\nUser: @${username}\nCommand: /reset\nStatus: UNAUTHORIZED\n\nOnly admins can reset the game.`);
        return;
      }

      const oldQueue = [...spinQueue];
      const oldState = this.gameStateManager.getState();
      
      this.gameStateManager.reset();
      const gameState = this.gameStateManager.getGameStateResponse();
      
      this.bot.sendMessage(msg.chat.id, `✅ **Game Reset Successfully**\n\n🔄 Action: FULL RESET\n🎮 Game State: RUNNING\n📋 Queue: CLEARED (was ${oldQueue.length} items)\n🎯 Round Active: ${gameState.roundActive ? 'YES' : 'NO'}\n📝 Previous Queue: [${oldQueue.join(', ') || 'empty'}]\n👤 Reset by: @${username}\n⏰ ${TimeUtils.getIndianTimeString()}\n\nGame is now ready for new rounds!`);
      await this.logAction(userId, username, 'reset_game', 'Full game reset', { queue: oldQueue, state: oldState }, { queue: [], state: GameState.RUNNING }, true);
    });

    // Help command
    this.bot.onText(/\/help/, async (msg) => {
      const userId = msg.from!.id;
      const username = msg.from?.username || msg.from?.first_name || 'Unknown';

      if (!this.isAdmin(userId)) {
        this.bot.sendMessage(msg.chat.id, `❌ **Access Denied**\n\nUser: @${username}\nCommand: /help\nStatus: UNAUTHORIZED\n\nOnly authorized admins can access help.`);
        return;
      }

      const gameState = this.gameStateManager.getGameStateResponse();
      const helpMessage = `🎰 **API-DRIVEN ROULETTE BOT**

📋 **QUEUE MANAGEMENT:**
• \`spin: <0-36>\` - Add number to spin queue
• \`/status\` - Show detailed game status
• \`/delete_queue\` - Clear entire queue
• \`/delete <number>\` - Remove specific number

🎮 **GAME CONTROL:**
• \`/resume\` - Resume paused game
• \`/stop\` - Pause game rounds
• \`/reset\` - Full reset (queue + state)

ℹ️ **CURRENT STATUS:**
🎮 Game State: ${this.gameStateManager.getState().toUpperCase()}
🎯 Round Active: ${gameState.roundActive ? 'YES' : 'NO'}
🎰 Spinning: ${gameState.isSpinning ? 'YES' : 'NO'}
📋 Queue Length: ${spinQueue.length}

🔧 **SYSTEM INFO:**
• API-driven polling system (no WebSocket)
• Round Duration: ${gameState.roundDuration}ms
• Admin-only access with full audit logging
• Real-time state synchronization

👤 **Help requested by:** @${username}
⏰ **Generated at:** ${TimeUtils.getIndianTimeString()}`;

      this.bot.sendMessage(msg.chat.id, helpMessage);
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

    if (!this.isAdmin(userId)) {
      this.bot.sendMessage(msg.chat.id, `❌ **Access Denied**\n\nUser: @${username}\nCommand: Queue Clear\nStatus: UNAUTHORIZED\n\nOnly admins can clear the queue.`);
      return;
    }

    const oldQueue = [...spinQueue];
    const queueLength = spinQueue.length;
    spinQueue.length = 0;
    
    if (queueLength > 0) {
      this.bot.sendMessage(msg.chat.id, `✅ **Queue Cleared Successfully**\n\n🗑️ Action: QUEUE CLEARED\n📋 Items Removed: ${queueLength}\n📝 Cleared Numbers: [${oldQueue.join(', ')}]\n📊 New Queue Length: 0\n👤 Cleared by: @${username}\n⏰ ${TimeUtils.getIndianTimeString()}`);
    } else {
      this.bot.sendMessage(msg.chat.id, `ℹ️ **Queue Already Empty**\n\n📋 Current Queue Length: 0\n👤 Attempted by: @${username}\n\nThe queue was already empty.`);
    }
    
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
