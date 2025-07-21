import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import { CONFIG } from '../config/config';
import { spinQueue } from '../bot/TelegramBotService';
import { Logger } from '../utils/Logger';
import { GameStateManager, GameStateResponse } from '../services/GameStateManager';
import { TimeUtils } from '../utils/TimeUtils';
import { SupabaseService } from '../services/SupabaseService';

export class GameServer {
  private app = express();
  private server = http.createServer(this.app);
  private gameStateManager: GameStateManager;
  private supabaseService: SupabaseService;
  
  // Simple rate limiting storage
  private requestCounts = new Map<string, { count: number; resetTime: number }>();
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly RATE_LIMIT_MAX = CONFIG.API_RATE_LIMIT; // requests per minute

  constructor() {
    this.gameStateManager = GameStateManager.getInstance();
    this.supabaseService = SupabaseService.getInstance();
    this.setupExpress();
    this.setupAPIRoutes();
    this.startAPIGameCycle();
  }

  private setupExpress() {
    // Request logging middleware
    this.app.use((req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        Logger.apiRequest(req.method, req.path, duration, res.statusCode);
      });
      
      next();
    });

    // Simple rate limiting middleware
    this.app.use((req, res, next) => {
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
      const now = Date.now();
      
      // Clean up expired entries
      for (const [ip, data] of this.requestCounts.entries()) {
        if (now > data.resetTime) {
          this.requestCounts.delete(ip);
        }
      }
      
      // Check current client
      const clientData = this.requestCounts.get(clientIp);
      if (!clientData || now > clientData.resetTime) {
        // Reset window
        this.requestCounts.set(clientIp, {
          count: 1,
          resetTime: now + this.RATE_LIMIT_WINDOW
        });
        next();
      } else if (clientData.count < this.RATE_LIMIT_MAX) {
        // Increment count
        clientData.count++;
        next();
      } else {
        // Rate limit exceeded
        Logger.warn('Rate limit exceeded', { clientIp, count: clientData.count });
        res.status(429).json({ 
          error: 'Too many requests',
          retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
        });
      }
    });

    // Enable CORS for all routes
    this.app.use(cors({
      origin: '*',
      credentials: true,
      optionsSuccessStatus: 200
    }));

    // Parse JSON bodies with size limit
    this.app.use(express.json({ limit: '10mb' }));

    // Serve static files (if any)
    this.app.use(express.static(path.join(__dirname, '../../public')));

    // Error handling middleware
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      Logger.error('Express error', { 
        error: error.message,
        path: req.path,
        method: req.method
      }, error);
      
      res.status(500).json({ 
        error: CONFIG.IS_PRODUCTION ? 'Internal server error' : error.message 
      });
    });

    Logger.info('📦 Express server configured with security middleware');
  }

  /**
   * 📡 Setup API routes for frontend communication
   * 
   * Available Endpoints:
   * 🎮 GET /api/game-state - Get current game state
   * 🎰 GET /api/spin-result - Get current spin result
   * 📊 GET /api/last-spin-results - Get last N spin results (supports ?limit=N&includeDeleted=true)
   * 🗑️ POST /api/spin-results/:id/delete - Soft delete a spin result
   * ♻️ POST /api/spin-results/:id/restore - Restore a deleted spin result  
   * 💥 DELETE /api/spin-results/:id - Permanently delete a spin result
   * 🏁 POST /api/spin-end - Manually end current spin
   * 🎯 POST /api/trigger-round-end - Manually trigger round end
   */
  private setupAPIRoutes() {
    // Enhanced health check endpoint
    this.app.get('/health', (req, res) => {
      try {
        const gameState = this.gameStateManager.getGameStateResponse();
        const healthStatus = this.gameStateManager.getHealthStatus();
        
        res.json({ 
          status: 'ok', 
          timestamp: TimeUtils.getIndianISOForDB(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          environment: CONFIG.NODE_ENV,
          gameState: this.gameStateManager.getState(),
          queuedSpins: spinQueue.length,
          health: healthStatus,
          ...gameState
        });
      } catch (error) {
        Logger.error('Health check failed', { error: error instanceof Error ? error.message : error }, error as Error);
        res.status(500).json({ 
          status: 'error',
          timestamp: TimeUtils.getIndianISOForDB(),
          error: 'Health check failed'
        });
      }
    });

    // Legacy status endpoint (keep for backward compatibility)
    this.app.get('/status', (req, res) => {
      const gameState = this.gameStateManager.getGameStateResponse();
      res.json({
        gameState: this.gameStateManager.getState(),
        queuedSpins: spinQueue.length,
        queue: spinQueue,
        isGameRunning: this.gameStateManager.isRunning(),
        statusMessage: this.gameStateManager.getStatusMessage(),
        ...gameState
      });
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🎯 NEW API ENDPOINTS FOR POLLING-BASED GAME FLOW
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * GET /api/game-state - Primary endpoint for frontend polling
     * Returns current game state for polling-based game flow with last spin result when idle
     */
    this.app.get('/api/game-state', async (req, res) => {
      // Record frontend activity
      this.gameStateManager.recordFrontendActivity();
      
      const gameState = await this.gameStateManager.getGameStateWithLastSpin();
      
      console.log(`📡 API: Game state requested - Round: ${gameState.roundActive}, Spinning: ${gameState.isSpinning}${gameState.lastSpinResult ? `, Last: ${gameState.lastSpinResult.spin_number}` : ''}`);
      
      res.json(gameState);
    });

    /**
     * POST /api/refresh-cache - Manually refresh last spin cache
     */
    this.app.post('/api/refresh-cache', async (req, res) => {
      try {
        await this.gameStateManager.refreshLastSpinCache();
        console.log('🔄 API: Last spin cache manually refreshed');
        res.json({ success: true, message: 'Cache refreshed successfully' });
      } catch (error) {
        console.error('❌ API: Error refreshing cache:', error);
        res.status(500).json({ success: false, error: 'Failed to refresh cache' });
      }
    });

    /**
     * GET /api/last-spin-results - Get last 5 spin results for display
     */
    this.app.get('/api/last-spin-results', async (req, res) => {
        // Track frontend activity
        this.gameStateManager.recordFrontendActivity();

        try {
            const includeDeleted = req.query.includeDeleted === 'true';
            const limit = parseInt(req.query.limit as string) || 5;
            
            console.log(`🔍 DEBUG: API request - limit: ${limit}, includeDeleted: ${includeDeleted}`);
            
            const results = await this.gameStateManager.getLastSpinResults(limit, includeDeleted);
            console.log(`🎰 API: Last spin results requested - Found ${results.length} results${includeDeleted ? ' (including deleted)' : ''}`);
            console.log(`🔍 DEBUG: Results data:`, results);
            
            res.json({ 
                results: results,
                count: results.length,
                includeDeleted: includeDeleted
            });
        } catch (error) {
            console.error(`❌ API: Error fetching last spin results:`, error);
            res.status(500).json({ 
                error: 'Failed to fetch spin results',
                results: [],
                count: 0 
            });
        }
    });

    /**
     * POST /api/test/create-sample-spins - Create sample spin results for testing
     */
    this.app.post('/api/test/create-sample-spins', async (req, res) => {
        try {
            console.log('🧪 Creating sample spin results for testing...');
            
            const sampleSpins = [
                { number: 32, color: 'Red', parity: 'Even',doneby: "@admin" },
                { number: 0, color: 'Green', parity: 'None',doneby: "@admin" },
                { number: 15, color: 'Black', parity: 'Odd',doneby: "@admin" },
                { number: 7, color: 'Red', parity: 'Odd',doneby: "@admin" },
                { number: 22, color: 'Black', parity: 'Even',doneby: "@admin" },
                { number: 35, color: 'Black', parity: 'Odd',doneby: "@admin" },
                { number: 12, color: 'Red', parity: 'Even',doneby: "@admin" }
            ];

            const results = [];
            for (const spin of sampleSpins) {
                const success = await this.supabaseService.storeSpinResult(spin.number, spin.color, spin.parity, spin.doneby);
                if (success) {
                    results.push(spin);
                    console.log(`✅ Created sample spin: ${spin.number} ${spin.color} ${spin.parity}`);
                } else {
                    console.warn(`⚠️ Failed to create sample spin: ${spin.number}`);
                }
            }

            console.log(`🧪 Successfully created ${results.length} sample spin results`);
            res.json({ 
                success: true, 
                message: `Created ${results.length} sample spin results`,
                results: results
            });
        } catch (error) {
            console.error(`❌ Error creating sample spins:`, error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to create sample spin results' 
            });
        }
    });

    /**
     * POST /api/spin-results/:id/delete - Soft delete a spin result
     */
    this.app.post('/api/spin-results/:id/delete', async (req, res) => {
        try {
            const { id } = req.params;
            const success = await this.supabaseService.softDeleteSpinResult(id);
            
            if (success) {
                console.log(`🗑️ API: Spin result soft deleted: ${id}`);
                res.json({ success: true, message: 'Spin result deleted successfully' });
            } else {
                res.status(500).json({ success: false, error: 'Failed to delete spin result' });
            }
        } catch (error) {
            console.error(`❌ API: Error deleting spin result:`, error);
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    });

    /**
     * POST /api/spin-results/:id/restore - Restore a soft deleted spin result
     */
    this.app.post('/api/spin-results/:id/restore', async (req, res) => {
        try {
            const { id } = req.params;
            const success = await this.supabaseService.restoreSpinResult(id);
            
            if (success) {
                console.log(`♻️ API: Spin result restored: ${id}`);
                res.json({ success: true, message: 'Spin result restored successfully' });
            } else {
                res.status(500).json({ success: false, error: 'Failed to restore spin result' });
            }
        } catch (error) {
            console.error(`❌ API: Error restoring spin result:`, error);
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    });

    /**
     * DELETE /api/spin-results/:id - Permanently delete a spin result
     */
    this.app.delete('/api/spin-results/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const success = await this.supabaseService.permanentlyDeleteSpinResult(id);
            
            if (success) {
                console.log(`💥 API: Spin result permanently deleted: ${id}`);
                res.json({ success: true, message: 'Spin result permanently deleted' });
            } else {
                res.status(500).json({ success: false, error: 'Failed to permanently delete spin result' });
            }
        } catch (error) {
            console.error(`❌ API: Error permanently deleting spin result:`, error);
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    });

    /**
     * GET /api/spin-result - Optional endpoint to get spin result
     * Can be used by frontend after countdown completes to get spin index
     */
    this.app.get('/api/spin-result', (req, res) => {
      // Record frontend activity
      this.gameStateManager.recordFrontendActivity();
      
      const spinResult = this.gameStateManager.getSpinResult();
      
      if (spinResult) {
        console.log(`🎰 API: Spin result requested - Index: ${spinResult.spinIndex}`);
        res.json(spinResult);
      } else {
        console.log(`❌ API: No active spin result available`);
        res.status(404).json({ error: 'No active spin result available' });
      }
    });

    /**
     * POST /api/spin-end - Optional endpoint to manually end spin
     * Can be used by frontend to indicate spin animation is complete
     */
    this.app.post('/api/spin-end', (req, res) => {
      // Record frontend activity
      this.gameStateManager.recordFrontendActivity();
      
      const gameState = this.gameStateManager.getGameStateResponse();
      
      if (gameState.isSpinning) {
        this.gameStateManager.endSpin();
        console.log(`🏁 API: Spin manually ended`);
        res.json({ success: true, message: 'Spin ended successfully' });
      } else {
        console.log(`❌ API: No active spin to end`);
        res.status(400).json({ error: 'No active spin to end' });
      }
    });

    /**
     * POST /api/trigger-round-end - Manual control endpoint
     * Allows manual triggering of round end (for testing/admin control)
     */
    this.app.post('/api/trigger-round-end', async (req, res) => {
      const success = await this.gameStateManager.triggerRoundEnd();
      
      if (success) {
        console.log(`🎮 API: Round manually triggered to end`);
        res.json({ success: true, message: 'Round ended and spin started' });
      } else {
        console.log(`❌ API: No active round to end`);
        res.status(400).json({ error: 'No active round to end' });
      }
    });

    /**
     * POST /api/trigger-spin - Manual spin trigger endpoint
     * Allows manual triggering of specific spin index
     */
    this.app.post('/api/trigger-spin', async (req, res) => {
      try {
        const { spinIndex } = req.body;
        
        // Input validation
        if (spinIndex === undefined || spinIndex === null) {
          res.status(400).json({ 
            error: 'Missing required field: spinIndex',
            expected: 'number between 0-36'
          });
          return;
        }
        
        if (typeof spinIndex !== 'number') {
          res.status(400).json({ 
            error: 'spinIndex must be a number',
            received: typeof spinIndex,
            expected: 'number between 0-36'
          });
          return;
        }
        
        if (!Number.isInteger(spinIndex) || spinIndex < 0 || spinIndex > 36) {
          res.status(400).json({ 
            error: 'spinIndex must be an integer between 0-36',
            received: spinIndex
          });
          return;
        }
        
        // Check queue size
        if (spinQueue.length >= CONFIG.MAX_SPIN_QUEUE_SIZE) {
          res.status(429).json({ 
            error: 'Spin queue is full',
            queueSize: spinQueue.length,
            maxSize: CONFIG.MAX_SPIN_QUEUE_SIZE
          });
          return;
        }
        
        const success = await this.gameStateManager.triggerManualSpin(spinIndex);
        
        if (success) {
          Logger.gameEvent('manual_spin_triggered', { spinIndex, source: 'api' });
          res.json({ success: true, message: `Spin ${spinIndex} triggered successfully` });
        } else {
          res.status(400).json({ 
            error: 'Failed to trigger spin',
            reason: 'Game may be in invalid state or spin already active',
            spinIndex
          });
        }
      } catch (error) {
        Logger.error('API trigger-spin error', { error: error instanceof Error ? error.message : error }, error as Error);
        res.status(500).json({ 
          error: 'Internal server error',
          message: CONFIG.IS_PRODUCTION ? 'Something went wrong' : (error as Error).message
        });
      }
    });

    /**
     * POST /api/trigger-random-spin - Random spin trigger endpoint  
     * Generates and triggers a random spin (for testing)
     */
    this.app.post('/api/trigger-random-spin', async (req, res) => {
      const success = await this.gameStateManager.triggerRandomSpin();
      
      if (success) {
        console.log(`🎲 API: Random spin triggered`);
        res.json({ success: true, message: 'Random spin triggered successfully' });
      } else {
        console.log(`❌ API: Failed to trigger random spin`);
        res.status(400).json({ error: 'Failed to trigger random spin. Check if no spin is already active.' });
      }
    });

    console.log('🌐 API routes configured for polling-based game flow');
  }

  /**
   * Start the API-driven game cycle
   * Replaces the old WebSocket-based game loop
   */
  private startAPIGameCycle(): void {
    console.log('🔄 Starting API-driven game cycle (replacing WebSocket loop)');
    
    // Start the automatic game cycle
    // this.gameStateManager.startAutoCycle();
    
    console.log('🎯 Game will start rounds only when spins are queued via Telegram bot');
  }

  /**
   * Start the server
   */
  public start(): void {
    const port = CONFIG.PORT;
    
    this.server.listen(port, () => {
      console.log(`
🎰 API-DRIVEN ROULETTE SERVER STARTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Server: http://localhost:${port}
🏥 Health: http://localhost:${port}/health
📊 Status: http://localhost:${port}/status

 🎯 NEW API ENDPOINTS:
 📡 Game State: GET /api/game-state
 🎰 Spin Result: GET /api/spin-result
 🏁 End Spin: POST /api/spin-end
 🎮 Trigger Round: POST /api/trigger-round-end
 🎯 Manual Spin: POST /api/trigger-spin
 🎲 Random Spin: POST /api/trigger-random-spin

🔄 Game Flow: API-driven polling (no WebSocket required)
⏰ Round Duration: ${CONFIG.ROUND_DURATION}ms
🎾 Spin Duration: ${CONFIG.FRONTEND_SPIN_DURATION + CONFIG.SPIN_BUFFER_TIME}ms
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
    });

    this.server.on('error', (error) => {
      Logger.error(`❌ Server error: ${error.message}`);
    });
  }
}
