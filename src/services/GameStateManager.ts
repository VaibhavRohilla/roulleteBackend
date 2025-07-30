import { Logger } from '../utils/Logger';
import { spinQueue } from '../bot/TelegramBotService';
import { CONFIG } from '../config/config';
import { TimeUtils } from '../utils/TimeUtils';
import { SupabaseService } from './SupabaseService';
import { isValidRouletteNumber } from '../utils/RouletteUtils';

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
  lastSpinResult?: {
    spin_number: number;
    color: string;
    parity: string;
    timestamp: string;
  };
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

  // CRITICAL FIX: Timer management to prevent race conditions
  private activeRoundTimer: NodeJS.Timeout | null = null;
  private activeSpinTimer: NodeJS.Timeout | null = null;
  private operationLock: boolean = false; // Prevent concurrent operations

  // Frontend activity tracking
  private lastFrontendActivity: Date | null = null;
  private activityCheckTimer: NodeJS.Timeout | null = null;

  // Cached last spin result (to avoid repeated DB calls)
  private cachedLastSpinResult: any = null;
  private lastSpinCacheTime: Date | null = null;
  private readonly CACHE_DURATION = 300000; // 5 minutes cache

  private constructor() {
    console.log('🎮 GameStateManager initialized with API-driven state tracking');
    this.supabaseService = SupabaseService.getInstance();
    this.startActivityMonitoring();
    // Load initial last spin result cache
    this.loadInitialLastSpinCache();
  }

  /**
   * Load initial last spin result cache on startup
   */
  private async loadInitialLastSpinCache(): Promise<void> {
    try {
      await this.getLastSpinResult(true); // Force refresh on startup
      console.log('📦 Initial last spin result cache loaded');
    } catch (error) {
      console.warn('⚠️ Failed to load initial last spin cache:', error);
    }
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
   * Reset game state and clear queue - MEMORY LEAK FIXED
   */
  public reset(): void {
    // CRITICAL FIX: Clear all timers to prevent memory leaks
    this.clearRoundTimer();
    this.clearSpinTimer();
    this.stopActivityMonitoring();

    this.currentState = GameState.RUNNING;
    this.roundActive = false;
    this.isSpinning = false;
    this.currentRoundStartTime = null;
    this.currentSpinIndex = null;
    this.lastFrontendActivity = null;
    this.operationLock = false; // Reset operation lock
    this.clearLastSpinCache(); // Clear cache on reset
    spinQueue.length = 0;
    
    console.log('🔄 Game state reset - All timers cleared, queue cleared, cache cleared, frontend activity reset, game resumed');
    
    // Restart activity monitoring
    this.startActivityMonitoring();
    
    this.resumeCallbacks.forEach(callback => callback());
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🎯 API-DRIVEN STATE MANAGEMENT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Start a new round with countdown timer - RACE CONDITION FIXED
   */
  public startNewRound(): boolean {
    // CRITICAL FIX: Add operation lock to prevent concurrent execution
    if (this.operationLock) {
      console.log('🔒 Operation in progress, cannot start new round');
      return false;
    }

    if (!this.isRunning()) {
      console.log('⏸️ Cannot start round - game is not running');
      return false;
    }

    if (this.roundActive) {
      console.log('⏳ Round already active, cannot start new round');
      return false;
    }

    this.operationLock = true;

    try {
      // CRITICAL FIX: Clear any existing round timer before starting new one
      this.clearRoundTimer();

      this.roundActive = true;
      this.isSpinning = false;
      this.currentRoundStartTime = new Date();
      this.currentSpinIndex = null;
      
      console.log(`🕒 New round started - Duration: ${this.roundDuration}ms (Timer: ${this.activeRoundTimer ? 'EXISTING CLEARED' : 'NEW'})`);
      
      // CRITICAL FIX: Store timer ID for proper cleanup
      this.activeRoundTimer = setTimeout(async () => {
        console.log('⏰ Round timer expired - ending round');
        await this.endRound();
      }, this.roundDuration);

      this.operationLock = false;
      return true;
    } catch (error) {
      this.operationLock = false;
      console.error('❌ Error starting new round:', error);
      return false;
    }
  }

  /**
   * CRITICAL FIX: Clear round timer safely
   */
  private clearRoundTimer(): void {
    if (this.activeRoundTimer) {
      clearTimeout(this.activeRoundTimer);
      this.activeRoundTimer = null;
      console.log('🧹 Previous round timer cleared');
    }
  }

  /**
   * CRITICAL FIX: Clear spin timer safely
   */
  private clearSpinTimer(): void {
    if (this.activeSpinTimer) {
      clearTimeout(this.activeSpinTimer);
      this.activeSpinTimer = null;
      console.log('🧹 Previous spin timer cleared');
    }
  }

  /**
   * End the current round and trigger spin - RACE CONDITION FIXED
   */
  public async endRound(): Promise<void> {
    // CRITICAL FIX: Add operation lock to prevent concurrent execution
    if (this.operationLock) {
      console.log('🔒 Operation in progress, cannot end round');
      return;
    }

    if (!this.roundActive) {
      console.log('❌ Cannot end round - no active round');
      return;
    }

    this.operationLock = true;

    try {
      // CRITICAL FIX: Clear round timer as round is ending
      this.clearRoundTimer();

      // CRITICAL FIX: Atomic queue operation with rollback capability
      const spins = [...spinQueue];
      const originalQueueLength = spinQueue.length;

      if (spins.length === 0) {
        // No spins queued - just end the round without spinning
        console.log('💤 No queued spins. Round ended without spin - entering idle state.');
        this.roundActive = false;
        this.isSpinning = false;
        this.currentSpinIndex = null;
        this.operationLock = false;
        
        // Stay idle - new rounds will only start when spins are queued via Telegram
        console.log('⏸️ Game idle - waiting for spins to be queued via Telegram bot');
        return;
      }

      // Clear queue atomically (can rollback if needed)
      spinQueue.length = 0;

      try {
        // Use first queued spin
        this.currentSpinIndex = spins[0];
        console.log(`🌀 Using queued spin: ${this.currentSpinIndex} (already stored in DB by Telegram)`);
        
        // Log spin processing to audit trail  
        await this.logSpinProcessing(spins[0], spins, spins.length - 1);
        
        // Put remaining spins back in queue
        if (spins.length > 1) {
          spinQueue.unshift(...spins.slice(1));
          console.log(`📋 ${spins.length - 1} spins returned to queue`);
        }

        // CRITICAL FIX: Clear any existing spin timer before setting new one
        this.clearSpinTimer();

        this.isSpinning = true;
        this.roundActive = false; // Round ends when spin starts
        console.log(`🎰 Round ended, spin started with index: ${this.currentSpinIndex}`);
        
        // CRITICAL FIX: Store spin timer ID for proper cleanup
        const spinDuration = CONFIG.FRONTEND_SPIN_DURATION + CONFIG.SPIN_BUFFER_TIME;
        this.activeSpinTimer = setTimeout(async () => {
          console.log('⏰ Spin timer expired - ending spin');
          await this.endSpin();
        }, spinDuration);

        this.operationLock = false;

      } catch (error) {
        // CRITICAL FIX: Rollback queue state on error
        console.error('❌ Error processing spin, rolling back queue:', error);
        spinQueue.length = 0;
        spinQueue.push(...spins);
        console.log(`🔄 Queue rolled back to ${originalQueueLength} items`);
        
        this.roundActive = false;
        this.isSpinning = false;
        this.currentSpinIndex = null;
        this.operationLock = false;
        throw error;
      }

    } catch (error) {
      this.operationLock = false;
      console.error('❌ Error in endRound:', error);
      throw error;
    }
  }

  /**
   * End the current spin and enter idle state - RACE CONDITION FIXED
   */
  public async endSpin(): Promise<void> {
    // CRITICAL FIX: Add operation lock to prevent concurrent execution
    if (this.operationLock) {
      console.log('🔒 Operation in progress, cannot end spin');
      return;
    }

    if (!this.isSpinning) {
      console.log('❌ Cannot end spin - no active spin');
      return;
    }

    this.operationLock = true;

    try {
      // CRITICAL FIX: Clear spin timer as spin is ending
      this.clearSpinTimer();

      this.isSpinning = false;
      this.currentSpinIndex = null;
      
      // Refresh last spin cache since we just completed a spin
      await this.refreshLastSpinCache();
      
      console.log('🏁 Spin completed, entering idle state');
      console.log('⏸️ Game will remain idle until new spins are queued');

      this.operationLock = false;

    } catch (error) {
      this.operationLock = false;
      console.error('❌ Error in endSpin:', error);
      throw error;
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
   * Log spin processing to audit trail
   */
  private async logSpinProcessing(usedSpin: number, originalQueue: number[], remainingCount: number): Promise<void> {
    try {
      await this.supabaseService.logAction({
        user_id: 0, // System action
        username: 'GameStateManager',
        action: 'process_spin',
        details: `Processed spin: ${usedSpin} from queue. ${remainingCount} spins returned to queue.`,
        old_value: originalQueue,
        new_value: spinQueue.length > 0 ? [...spinQueue] : [],
        success: true
      });
      console.log(`📋 Audit logged: Processed spin ${usedSpin}, ${remainingCount} spins returned to queue`);
    } catch (error) {
      Logger.error(`❌ Failed to log spin processing: ${error}`);
      // Don't throw - this shouldn't stop game flow
    }
  }

  /**
   * Get the last spin result with intelligent caching
   */
  public async getLastSpinResult(forceRefresh: boolean = false): Promise<any> {
    // Check if we have valid cached data
    if (!forceRefresh && this.cachedLastSpinResult && this.lastSpinCacheTime) {
      const timeSinceCache = Date.now() - this.lastSpinCacheTime.getTime();
      if (timeSinceCache < this.CACHE_DURATION) {
        console.log('📦 Using cached last spin result');
        return this.cachedLastSpinResult;
      }
    }

    // Fetch fresh data from database
    try {
      console.log('🔄 Fetching fresh last spin result from database');
      const results = await this.supabaseService.getLastSpinResults(1, false);
      const lastSpinResult = results.length > 0 ? results[0] : null;
      
      // Update cache
      this.cachedLastSpinResult = lastSpinResult;
      this.lastSpinCacheTime = new Date();
      
      return lastSpinResult;
    } catch (error) {
      Logger.error(`❌ Error retrieving last spin result: ${error}`);
      // Return cached data if available, even if stale
      return this.cachedLastSpinResult;
    }
  }

  /**
   * Refresh the last spin result cache (call after spin completion)
   */
  public async refreshLastSpinCache(): Promise<void> {
    console.log('🔄 Refreshing last spin result cache');
    await this.getLastSpinResult(true);
  }

  /**
   * Clear the last spin result cache
   */
  public clearLastSpinCache(): void {
    console.log('🗑️ Clearing last spin result cache');
    this.cachedLastSpinResult = null;
    this.lastSpinCacheTime = null;
  }

  /**
   * Get current game state for API response (synchronous version)
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
      spinIndex: this.currentSpinIndex !== null ? this.currentSpinIndex : undefined,
      roundStartTime: this.currentRoundStartTime ? TimeUtils.toIndianISO(this.currentRoundStartTime) : undefined,
      roundDuration: this.roundDuration
    };
  }

  /**
   * Get current game state with last spin result for API response
   */
  public async getGameStateWithLastSpin(): Promise<GameStateResponse> {
    const gameState = this.getGameStateResponse();
    
    // If no active game, include cached last spin result
    if (!gameState.roundActive && !gameState.isSpinning) {
      // Use cached data first, fallback to fresh fetch if no cache
      const lastSpin = this.cachedLastSpinResult || await this.getLastSpinResult();
      if (lastSpin) {
        gameState.lastSpinResult = {
          spin_number: lastSpin.spin_number,
          color: lastSpin.color,
          parity: lastSpin.parity,
          timestamp: lastSpin.timestamp || lastSpin.created_at
        };
      }
    }
    
    return gameState;
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
  public async triggerRoundEnd(): Promise<boolean> {
    if (!this.roundActive) {
      return false;
    }
    
    console.log('🎮 Manually triggering round end');
    await this.endRound();
    return true;
  }

  /**
   * Manually trigger a spin with specific index (for testing/admin)
   */
  public async triggerManualSpin(spinIndex: number): Promise<boolean> {
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
      await this.endRound();
    } else {
      console.log('🎮 Manual spin queued - will process in next round');
    }

    return true;
  }

  /**
   * Generate a random spin and add to queue (for testing only)
   */
  public async triggerRandomSpin(): Promise<boolean> {
    const randomIndex = Math.floor(Math.random() * 37);
    console.log(`🎲 Generating random spin: ${randomIndex}`);
    return await this.triggerManualSpin(randomIndex);
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
          // Use direct state change instead of endSpin() to avoid async issues in timer context
          // Note: Spin result was already stored when spin started, no need to store again
          this.isSpinning = false;
          this.currentSpinIndex = null;
          console.log('🏁 Auto-ended spin due to frontend inactivity (direct state change)');
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

  /**
   * Cleanup all timers and resources (for graceful shutdown) - MEMORY LEAK FIXED
   */
  public cleanup(): void {
    console.log('🧹 Starting GameStateManager cleanup...');
    
    // CRITICAL FIX: Clear all game timers
    this.clearRoundTimer();
    this.clearSpinTimer();
    this.stopActivityMonitoring();
    this.clearLastSpinCache();
    
    // Clear any pending timeouts (edge case handling)
    if (this.activityCheckTimer) {
      clearInterval(this.activityCheckTimer);
      this.activityCheckTimer = null;
    }

    // Reset state to prevent further operations
    this.operationLock = false;
    this.roundActive = false;
    this.isSpinning = false;
    this.currentRoundStartTime = null;
    this.currentSpinIndex = null;
    
    Logger.info('🧹 GameStateManager cleanup completed - All timers cleared');
  }

  /**
   * Get system health status
   */
  public getHealthStatus(): any {
    return {
      state: this.currentState,
      roundActive: this.roundActive,
      isSpinning: this.isSpinning,
      queueLength: spinQueue.length,
      cacheStatus: {
        hasCache: !!this.cachedLastSpinResult,
        cacheAge: this.lastSpinCacheTime ? Date.now() - this.lastSpinCacheTime.getTime() : null
      },
      activityTracking: {
        lastActivity: this.lastFrontendActivity,
        timeSinceActivity: this.getTimeSinceLastActivity()
      }
    };
  }
} 