import { Logger } from '../utils/Logger';
import { spinQueue } from '../bot/TelegramBotService';

export enum GameState {
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPED = 'stopped'
}

export class GameStateManager {
  private static instance: GameStateManager;
  private currentState: GameState = GameState.RUNNING;
  private pauseCallbacks: Array<() => void> = [];
  private resumeCallbacks: Array<() => void> = [];

  private constructor() {
    console.log('🎮 GameStateManager initialized');
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
   * Check if game is stopped
   */
  public isStopped(): boolean {
    return this.currentState === GameState.STOPPED;
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
   * Resume the game
   */
  public resume(): boolean {
    if (this.currentState === GameState.PAUSED) {
      this.currentState = GameState.RUNNING;
      console.log('▶️ Game resumed');
      this.resumeCallbacks.forEach(callback => callback());
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
    spinQueue.length = 0;
    console.log('🔄 Game state reset - Queue cleared, game resumed');
    this.resumeCallbacks.forEach(callback => callback());
  }

  /**
   * Register callback for pause events
   */
  public onPause(callback: () => void): void {
    this.pauseCallbacks.push(callback);
  }

  /**
   * Register callback for resume events
   */
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

    return `${stateEmoji[this.currentState]} Game Status: ${this.currentState.toUpperCase()}
📋 Queue: ${spinQueue.length} spins
🕒 Last Update: ${new Date().toLocaleTimeString()}`;
  }
} 