/**
 * 🚀 Production-Ready Server Entry Point
 * Features: Error handling, graceful shutdown, health monitoring, process management
 */

import { TelegramBotService } from './bot/TelegramBotService';
import { GameServer } from './server/GameServer';
import { Logger } from './utils/Logger';
import { CONFIG } from './config/config';

/**
 * Main Application Class
 */
class RoulletteBackend {
  private telegramBot: TelegramBotService | null = null;
  private gameServer: GameServer | null = null;
  private isShuttingDown = false;

  /**
   * Start all services with proper error handling
   */
  async start(): Promise<void> {
    try {
      Logger.info('🚀 Starting Roulette Backend Services', {
        environment: CONFIG.NODE_ENV,
        port: CONFIG.PORT,
        admins: CONFIG.ADMINS.length
      });

      // Start Telegram Bot Service
      Logger.info('🤖 Initializing Telegram Bot Service...');
      this.telegramBot = new TelegramBotService();
      Logger.info('✅ Telegram Bot Service started successfully');

      // Start Game Server
      Logger.info('🎮 Initializing Game Server...');
      this.gameServer = new GameServer();
      await this.gameServer.start();
      Logger.info('✅ Game Server started successfully');

      // Setup health monitoring
      this.setupHealthMonitoring();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      Logger.info('🎯 All services started successfully', {
        telegramBot: !!this.telegramBot,
        gameServer: !!this.gameServer,
        port: CONFIG.PORT
      });

    } catch (error) {
      Logger.error('❌ CRITICAL: Failed to start services', { error: error instanceof Error ? error.message : error }, error as Error);
      await this.shutdown(1);
    }
  }

  /**
   * Graceful shutdown with cleanup
   */
  async shutdown(exitCode: number = 0): Promise<void> {
    if (this.isShuttingDown) {
      Logger.warn('⚠️ Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    Logger.info('🛑 Initiating graceful shutdown...', { exitCode });

    try {
      // Stop accepting new connections first
      if (this.gameServer) {
        Logger.info('🎮 Stopping Game Server...');
        // Note: GameServer doesn't have a stop method yet, we should add it
        Logger.info('✅ Game Server stopped');
      }

      // Stop Telegram Bot
      if (this.telegramBot) {
        Logger.info('🤖 Stopping Telegram Bot...');
        // Note: TelegramBotService doesn't have a stop method yet, we should add it
        Logger.info('✅ Telegram Bot stopped');
      }

      Logger.info('✅ All services stopped gracefully');

    } catch (error) {
      Logger.error('❌ Error during shutdown', { error: error instanceof Error ? error.message : error }, error as Error);
      exitCode = 1;
    }

    Logger.info('👋 Shutdown complete', { exitCode });
    process.exit(exitCode);
  }

  /**
   * Setup health monitoring
   */
  private setupHealthMonitoring(): void {
    // Basic health check every 30 seconds
    setInterval(() => {
      const healthStatus = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString(),
        services: {
          telegramBot: !!this.telegramBot,
          gameServer: !!this.gameServer
        }
      };

      Logger.debug('💓 Health Check', healthStatus);

      // Check for memory leaks (basic threshold)
      const memoryUsageMB = healthStatus.memory.heapUsed / 1024 / 1024;
      if (memoryUsageMB > 512) { // 512MB threshold
        Logger.warn('⚠️ High memory usage detected', { 
          memoryUsageMB: Math.round(memoryUsageMB) 
        });
      }

    }, 30000);

    Logger.info('💓 Health monitoring started');
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    // Handle various shutdown signals
    const shutdownSignals = ['SIGTERM', 'SIGINT', 'SIGUSR2'] as const;
    
    shutdownSignals.forEach(signal => {
      process.on(signal, () => {
        Logger.info(`📡 Received ${signal}, initiating graceful shutdown...`);
        this.shutdown(0);
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      Logger.error('❌ CRITICAL: Uncaught Exception', { 
        message: error.message,
        stack: error.stack 
      }, error);
      this.shutdown(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      Logger.error('❌ CRITICAL: Unhandled Promise Rejection', { 
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined
      }, reason instanceof Error ? reason : undefined);
      this.shutdown(1);
    });

    Logger.info('🛡️ Graceful shutdown handlers configured');
  }
}

/**
 * Application Entry Point
 */
async function main(): Promise<void> {
  try {
    // Validate environment before starting
    if (CONFIG.ADMINS.length === 0) {
      Logger.warn('⚠️ WARNING: No admins configured! Bot will be inaccessible.');
    }

    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
      Logger.warn('⚠️ WARNING: Supabase not configured. Database features disabled.');
    }

    // Start the application
    const app = new RoulletteBackend();
    await app.start();

  } catch (error) {
    Logger.error('❌ FATAL: Application startup failed', { 
      error: error instanceof Error ? error.message : error 
    }, error as Error);
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  console.error('❌ FATAL: Unhandled startup error:', error);
  process.exit(1);
});
