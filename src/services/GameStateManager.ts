import { Logger } from '../utils/Logger';
import { spinQueue } from '../bot/TelegramBotService';
import { CONFIG } from '../config/config';
import { TimeUtils } from '../utils/TimeUtils';
import { SupabaseService } from './SupabaseService';
import { getRouletteColor, getRouletteParity, isValidRouletteNumber } from '../utils/RouletteUtils';

export enum GameState {
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPED = 'stopped'
}

export interface GameStateResponse {
  roundActive: boolean;
  isSpinning: boolean;
  spinIndex?: number;
  roundStartTime?: string; // ISO date string
  roundDuration?: number; // in milliseconds
}

export class GameStateManager {
  private static instance: GameStateManager;
  private currentState: GameState = GameState.RUNNING;
  private pauseCallbacks: Array<() => void> = [];
  private resumeCallbacks: Array<() => void> = [];
  private supabaseService: SupabaseService;
  
  // API-driven game state tracking
  private roundActive: boolean = false;
  private isSpinning: boolean = false;
  private currentRoundStartTime: Date | null = null;
  private currentSpinIndex: number | null = null;
  private roundDuration: number = CONFIG.ROUND_DURATION;

  // Frontend activity tracking
  private lastFrontendActivity: Date | null = null;
  private activityCheckTimer: NodeJS.Timeout | null = null;

  private constructor() {
    console.log('🎮 GameStateManager initialized with API-driven state tracking');
    this.supabaseService = SupabaseService.getInstance();
    this.startActivityMonitoring();
  }

  public static getInstance(): GameStateManager {
    if (!GameStateManager.instance) {
      GameStateManager.instance = new GameStateManager();
    }
    return GameStateManager.instance;
  }

  /**
   * Get current game state
   */
  public getState(): GameState {
    return this.currentState;
  }

  /**
   * Check if game is running
   */
  public isRunning(): boolean {
    return this.currentState === GameState.RUNNING;
  }

  /**
   * Check if game is paused
   */
  public isPaused(): boolean {
    return this.currentState === GameState.PAUSED;
  }

  /**
   * Resume the game
   */
  public resume(): boolean {
    if (this.currentState !== GameState.RUNNING) {
      this.currentState = GameState.RUNNING;
      console.log('▶️ Game resumed');
      this.resumeCallbacks.forEach(callback => callback());
      return true;
    }
    return false;
  }

  /**
   * Pause the game
   */
  public pause(): boolean {
    if (this.currentState === GameState.RUNNING) {
      this.currentState = GameState.PAUSED;
      console.log('⏸️ Game paused');
      this.pauseCallbacks.forEach(callback => callback());
      return true;
    }
    return false;
  }

  /**
   * Stop the game completely
   */
  public stop(): boolean {
    if (this.currentState !== GameState.STOPPED) {
      this.currentState = GameState.STOPPED;
      console.log('⏹️ Game stopped');
      this.pauseCallbacks.forEach(callback => callback());
      return true;
    }
    return false;
  }

  /**
   * Reset game state and clear queue
   */
  public reset(): void {
    this.currentState = GameState.RUNNING;
    this.roundActive = false;
    this.isSpinning = false;
    this.currentRoundStartTime = null;
    this.currentSpinIndex = null;
    this.lastFrontendActivity = null;
    spinQueue.length = 0;
    console.log('🔄 Game state reset - Queue cleared, frontend activity reset, game resumed');
    this.resumeCallbacks.forEach(callback => callback());
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🎯 API-DRIVEN STATE MANAGEMENT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Start a new round with countdown timer
   */
  public startNewRound(): boolean {
    if (!this.isRunning()) {
      console.log('⏸️ Cannot start round - game is not running');
      return false;
    }

    if (this.roundActive) {
      console.log('⏳ Round already active, cannot start new round');
      return false;
    }

    this.roundActive = true;
    this.isSpinning = false;
    this.currentRoundStartTime = new Date();
    this.currentSpinIndex = null;
    
    console.log(`🕒 New round started - Duration: ${this.roundDuration}ms`);
    
    // Auto-end round after duration
    setTimeout(() => {
      this.endRound();
    }, this.roundDuration);

    return true;
  }

  /**
   * End the current round and trigger spin
   */
  public endRound(): void {
    if (!this.roundActive) {
      console.log('❌ Cannot end round - no active round');
      return;
    }

    // Process spin only if there are queued spins
    const spins = [...spinQueue];
    spinQueue.length = 0;

    if (spins.length === 0) {
      // No spins queued - just end the round without spinning
      console.log('💤 No queued spins. Round ended without spin - entering idle state.');
      this.roundActive = false;
      this.isSpinning = false;
      this.currentSpinIndex = null;
      
      // Stay idle - new rounds will only start when spins are queued via Telegram
      console.log('⏸️ Game idle - waiting for spins to be queued via Telegram bot');
      
      return;
    }

    // Use first queued spin
    this.currentSpinIndex = spins[0];
    console.log(`🌀 Using queued spin: ${this.currentSpinIndex}`);
    
    // Put remaining spins back in queue
    if (spins.length > 1) {
      spinQueue.unshift(...spins.slice(1));
      console.log(`📋 ${spins.length - 1} spins returned to queue`);
    }

    this.isSpinning = true;
    this.roundActive = false; // Round ends when spin starts
    
    console.log(`🎰 Round ended, spin started with index: ${this.currentSpinIndex}`);
    
    // Auto-end spin after frontend animation duration
    const spinDuration = CONFIG.FRONTEND_SPIN_DURATION + CONFIG.SPIN_BUFFER_TIME;
    setTimeout(() => {
      this.endSpin();
    }, spinDuration);
  }

  /**
   * End the current spin and enter idle state
   */
  public endSpin(): void {
    if (!this.isSpinning) {
      console.log('❌ Cannot end spin - no active spin');
      return;
    }

    // Store the spin result before ending the spin
    if (this.currentSpinIndex !== null) {
      this.storeSpinResult(this.currentSpinIndex);
    }

    this.isSpinning = false;
    this.currentSpinIndex = null;
    console.log('🏁 Spin completed, entering idle state');
    console.log('⏸️ Game will remain idle until new spins are queued');
  }

  /**
   * Store spin result to database
   */
  private async storeSpinResult(spinNumber: number): Promise<void> {
    try {
      // Calculate roulette properties for the winning number
      const color = getRouletteColor(spinNumber);
      const parity = getRouletteParity(spinNumber);
      
      console.log(`💾 Storing spin result: ${spinNumber} ${color} ${parity}`);
      
      const success = await this.supabaseService.storeSpinResult(spinNumber, color, parity);
      
      if (success) {
        console.log(`✅ Spin result stored successfully: ${spinNumber} ${color} ${parity}`);
      } else {
        console.warn(`⚠️ Failed to store spin result: ${spinNumber}`);
      }
    } catch (error) {
      Logger.error(`❌ Error storing spin result: ${error}`);
    }
  }



  /**
   * Get last spin results from database
   */
  public async getLastSpinResults(limit: number = 5, includeDeleted: boolean = false): Promise<any[]> {
    try {
      const results = await this.supabaseService.getLastSpinResults(limit, includeDeleted);
      const resultText = includeDeleted ? 'spin results (including deleted)' : 'active spin results';
      console.log(`📊 Retrieved ${results.length} ${resultText} for API`);
      return results;
    } catch (error) {
      Logger.error(`❌ Error retrieving spin results: ${error}`);
      return [];
    }
  }

  /**
   * Get current game state for API response
   */
  public getGameStateResponse(): GameStateResponse {
    // Check if round has expired
    if (this.roundActive && this.currentRoundStartTime) {
      const timeElapsed = Date.now() - this.currentRoundStartTime.getTime();
      if (timeElapsed >= this.roundDuration) {
        // Round should have ended automatically, but ensure state is consistent
        console.log('⏰ Round expired, ending now');
        this.endRound();
      }
    }

    return {
      roundActive: this.roundActive,
      isSpinning: this.isSpinning,
      spinIndex: this.currentSpinIndex || undefined,
      roundStartTime: this.currentRoundStartTime ? TimeUtils.toIndianISO(this.currentRoundStartTime) : undefined,
      roundDuration: this.roundDuration
    };
  }

  /**
   * Get spin result (for optional /api/spin-result endpoint)
   */
  public getSpinResult(): { spinIndex: number } | null {
    if (!this.isSpinning || this.currentSpinIndex === null) {
      return null;
    }
    
    return { spinIndex: this.currentSpinIndex };
  }

  /**
   * Force trigger a round end (for manual control)
   */
  public triggerRoundEnd(): boolean {
    if (!this.roundActive) {
      return false;
    }
    
    console.log('🎮 Manually triggering round end');
    this.endRound();
    return true;
  }

  /**
   * Manually trigger a spin with specific index (for testing/admin)
   */
  public triggerManualSpin(spinIndex: number): boolean {
    if (!isValidRouletteNumber(spinIndex)) {
      console.log(`❌ Invalid spin index: ${spinIndex}. Must be 0-36`);
      return false;
    }

    if (this.isSpinning) {
      console.log('❌ Cannot trigger manual spin - already spinning');
      return false;
    }

    // Add to front of queue and trigger if round is active
    spinQueue.unshift(spinIndex);
    console.log(`🎮 Manual spin ${spinIndex} added to queue`);

    if (this.roundActive) {
      console.log('🎮 Triggering round end to process manual spin');
      this.endRound();
    } else {
      console.log('🎮 Manual spin queued - will process in next round');
    }

    return true;
  }

  /**
   * Generate a random spin and add to queue (for testing only)
   */
  public triggerRandomSpin(): boolean {
    const randomIndex = Math.floor(Math.random() * 37);
    console.log(`🎲 Generating random spin: ${randomIndex}`);
    return this.triggerManualSpin(randomIndex);
  }

  /**
   * Check if it's time to start a new round automatically
   */
  public shouldStartNewRound(): boolean {
    return this.isRunning() && !this.roundActive && !this.isSpinning;
  }

  /**
   * Start automatic game cycle
   */
  public startAutoCycle(): void {
    const cycle = () => {
      // Only start new round if conditions are met and no round is starting
      if (this.shouldStartNewRound()) {
        console.log('🔄 Auto-cycle: Starting new round');
        this.startNewRound();
      }
      
      // Check again in 2 seconds to avoid rapid cycling
      setTimeout(cycle, 2000);
    };
    
    console.log('🔄 Starting automatic game cycle');
    
    // Start first round immediately if conditions are met
    if (this.shouldStartNewRound()) {
      console.log('🔄 Auto-cycle: Starting initial round');
      this.startNewRound();
    }
    
    // Begin the cycle
    setTimeout(cycle, 2000);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🔗 CALLBACK MANAGEMENT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  public onPause(callback: () => void): void {
    this.pauseCallbacks.push(callback);
  }

  public onResume(callback: () => void): void {
    this.resumeCallbacks.push(callback);
  }

  /**
   * Get game status for display
   */
  public getStatusMessage(): string {
    const stateEmoji = {
      [GameState.RUNNING]: '▶️',
      [GameState.PAUSED]: '⏸️',
      [GameState.STOPPED]: '⏹️'
    };

    const gameStatus = this.getGameStateResponse();
    const queueInfo = `📋 Queue: ${spinQueue.length} spins`;
    const roundInfo = gameStatus.roundActive ? '🎯 Round Active' : gameStatus.isSpinning ? '🎰 Spinning' : '💤 Idle';

    return `${stateEmoji[this.currentState]} Game Status: ${this.currentState.toUpperCase()}
${queueInfo}
${roundInfo}
🕒 Last Update: ${TimeUtils.getIndianTimeString()}`;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🔍 FRONTEND ACTIVITY TRACKING
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Record frontend activity (called on API requests)
   */
  public recordFrontendActivity(): void {
    this.lastFrontendActivity = new Date();
    console.log(`📡 Frontend activity recorded at ${TimeUtils.formatDateForIndian(this.lastFrontendActivity)}`);
  }

  /**
   * Check if frontend has been inactive for too long
   */
  public isFrontendInactive(): boolean {
    if (!this.lastFrontendActivity) {
      return false; // No activity recorded yet, don't consider inactive
    }

    const timeSinceLastActivity = Date.now() - this.lastFrontendActivity.getTime();
    return timeSinceLastActivity > CONFIG.FRONTEND_ACTIVITY_TIMEOUT;
  }

  /**
   * Get time since last frontend activity in milliseconds
   */
  public getTimeSinceLastActivity(): number {
    if (!this.lastFrontendActivity) {
      return 0;
    }
    return Date.now() - this.lastFrontendActivity.getTime();
  }

  /**
   * Start monitoring frontend activity and auto-end games when inactive
   */
  private startActivityMonitoring(): void {
    console.log('🔍 Starting frontend activity monitoring');
    
    const checkActivity = () => {
      if (this.isFrontendInactive() && (this.roundActive || this.isSpinning)) {
        const timeSinceActivity = this.getTimeSinceLastActivity();
        console.log(`⏱️ Frontend inactive for ${timeSinceActivity}ms, auto-ending game`);
        
        // Force end the current round/spin and enter idle state
        if (this.isSpinning) {
          this.isSpinning = false;
          this.currentSpinIndex = null;
          console.log('🏁 Auto-ended spin due to frontend inactivity');
        }
        
        if (this.roundActive) {
          this.roundActive = false;
          this.currentRoundStartTime = null;
          console.log('⏰ Auto-ended round due to frontend inactivity');
        }
        
        console.log('💤 Game entered idle state due to no frontend activity');
      }
    };

    // Check activity every configured interval
    this.activityCheckTimer = setInterval(checkActivity, CONFIG.ACTIVITY_CHECK_INTERVAL);
  }

  /**
   * Stop activity monitoring (cleanup)
   */
  public stopActivityMonitoring(): void {
    if (this.activityCheckTimer) {
      clearInterval(this.activityCheckTimer);
      this.activityCheckTimer = null;
      console.log('🔍 Stopped frontend activity monitoring');
    }
  }
} 