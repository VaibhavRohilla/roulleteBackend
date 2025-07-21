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

  constructor() {
    this.gameStateManager = GameStateManager.getInstance();
    this.supabaseService = SupabaseService.getInstance();
    this.setupExpress();
    this.setupAPIRoutes();
    this.startAPIGameCycle();
  }

  private setupExpress() {
    // Enable CORS for all routes
    this.app.use(cors({
      origin: '*',
      credentials: true,
      optionsSuccessStatus: 200
    }));

    // Parse JSON bodies
    this.app.use(express.json());

    // Serve static files (if any)
    this.app.use(express.static(path.join(__dirname, '../../public')));

    console.log('📦 Express server configured with CORS and static serving');
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
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const gameState = this.gameStateManager.getGameStateResponse();
      res.json({ 
        status: 'ok', 
        timestamp: TimeUtils.getIndianISOForDB(),
        gameState: this.gameStateManager.getState(),
        queuedSpins: spinQueue.length,
        ...gameState
      });
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
     * Returns current game state for polling-based game flow
     */
    this.app.get('/api/game-state', (req, res) => {
      // Record frontend activity
      this.gameStateManager.recordFrontendActivity();
      
      const gameState = this.gameStateManager.getGameStateResponse();
      
      console.log(`📡 API: Game state requested - Round: ${gameState.roundActive}, Spinning: ${gameState.isSpinning}`);
      
      res.json(gameState);
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
            
            const results = await this.gameStateManager.getLastSpinResults(limit, includeDeleted);
            console.log(`🎰 API: Last spin results requested - Found ${results.length} results${includeDeleted ? ' (including deleted)' : ''}`);
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
    this.app.post('/api/spin-end', async (req, res) => {
      // Record frontend activity
      this.gameStateManager.recordFrontendActivity();
      
      const gameState = this.gameStateManager.getGameStateResponse();
      
      if (gameState.isSpinning) {
        await this.gameStateManager.endSpin();
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
      const { spinIndex } = req.body;
      
      if (typeof spinIndex !== 'number') {
        res.status(400).json({ error: 'spinIndex must be a number' });
        return;
      }
      
      const success = await this.gameStateManager.triggerManualSpin(spinIndex);
      
      if (success) {
        console.log(`🎮 API: Manual spin triggered - Index: ${spinIndex}`);
        res.json({ success: true, message: `Spin ${spinIndex} triggered successfully` });
      } else {
        console.log(`❌ API: Failed to trigger spin - Index: ${spinIndex}`);
        res.status(400).json({ error: 'Failed to trigger spin. Check if index is valid (0-36) and no spin is already active.' });
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
