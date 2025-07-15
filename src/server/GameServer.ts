import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import { WebSocketServer, WebSocket as WSWebSocket } from 'ws';
import { CONFIG } from '../config/config';
import { spinQueue } from '../bot/TelegramBotService';
import { Logger } from '../utils/Logger';
import { GameStateManager } from '../services/GameStateManager';
import type { SpinMessage, RoundStartMessage } from '../types';

// Extend WebSocket interface for heartbeat
interface ExtendedWebSocket extends WSWebSocket {
  isAlive?: boolean;
}

export class GameServer {
  private app = express();
  private server = http.createServer(this.app);
  private wss = new WebSocketServer({ server: this.server });
  private clients = new Set<WSWebSocket>();
  private roundActive = false;
  private currentRoundStartTime = 0;
  private currentRoundEndTime = 0;
  private gameStateManager: GameStateManager;

  constructor() {
    this.gameStateManager = GameStateManager.getInstance();
    this.setupExpress();
    this.setupWebSocket();
    this.startGameCycle();
  }

  private setupExpress() {
    // Enable CORS for all routes
    this.app.use(cors({
      origin: ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
      credentials: true,
      optionsSuccessStatus: 200
    }));

    // Parse JSON bodies
    this.app.use(express.json());

    // Serve static files (if any)
    this.app.use(express.static(path.join(__dirname, '../../public')));

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        roundActive: this.roundActive,
        gameState: this.gameStateManager.getState(),
        connectedClients: this.clients.size,
        queuedSpins: spinQueue.length
      });
    });

    // Game status endpoint
    this.app.get('/status', (req, res) => {
      res.json({
        roundActive: this.roundActive,
        gameState: this.gameStateManager.getState(),
        connectedClients: this.clients.size,
        queuedSpins: spinQueue.length,
        queue: spinQueue,
        isGameRunning: this.gameStateManager.isRunning(),
        statusMessage: this.gameStateManager.getStatusMessage()
      });
    });

    console.log('📦 Express server configured with CORS and static serving');
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws: ExtendedWebSocket) => {
      console.log(`🟢 Client connected (Total: ${this.clients.size + 1})`);
      this.clients.add(ws);

      // Send current game state to newly connected client
      this.sendGameStateToClient(ws);

      // Setup heartbeat to detect dead connections
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle client disconnect
      ws.on('close', (code, reason) => {
        this.clients.delete(ws);
        console.log(`🔴 Client disconnected (Code: ${code}, Total: ${this.clients.size})`);
      });

      // Handle WebSocket errors
      ws.on('error', (error) => {
        Logger.error(`❌ WebSocket error: ${error.message}`);
        this.clients.delete(ws);
      });

      // Handle client messages (if needed for client->server communication)
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(ws, message);
        } catch (error) {
          Logger.error(`❌ Invalid message from client: ${data}`);
        }
      });
    });

    // Setup heartbeat interval to detect and remove dead connections
    const heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws: ExtendedWebSocket) => {
        if (ws.isAlive === false) {
          Logger.warn('💀 Terminating dead connection');
          this.clients.delete(ws);
          return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // Check every 30 seconds

    this.wss.on('close', () => {
      clearInterval(heartbeatInterval);
    });

    console.log('🌐 WebSocket server configured with heartbeat and reconnection handling');
  }

  /**
   * Send current game state to a specific client (used for reconnection)
   */
  private sendGameStateToClient(ws: WSWebSocket) {
    if (this.roundActive && this.currentRoundEndTime > Date.now()) {
      const timeLeft = this.currentRoundEndTime - Date.now();
      const gameState = {
        action: 'gameState',
        roundActive: this.roundActive,
        timeLeft: Math.max(0, timeLeft),
        connectedClients: this.clients.size,
        queuedSpins: spinQueue.length
      };
      
      this.sendToClient(ws, gameState);
      console.log(`📤 Sent current game state to reconnected client (${timeLeft}ms remaining)`);
    } else {
      // Round is not active, send waiting state
      const gameState = {
        action: 'gameState',
        roundActive: false,
        timeLeft: 0,
        connectedClients: this.clients.size,
        queuedSpins: spinQueue.length
      };
      
      this.sendToClient(ws, gameState);
      console.log(`📤 Sent waiting state to newly connected client`);
    }
  }

  /**
   * Handle messages from clients (for future extensibility)
   */
  private handleClientMessage(ws: WSWebSocket, message: any) {
    switch (message.action) {
      case 'ping':
        this.sendToClient(ws, { action: 'pong', timestamp: Date.now() });
        break;
      case 'requestGameState':
        this.sendGameStateToClient(ws);
        break;
      default:
        Logger.warn(`🤷‍♂️ Unknown client message: ${message.action}`);
    }
  }

  /**
   * Send message to a specific client with error handling
   */
  private sendToClient(ws: WSWebSocket, message: any) {
    try {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
      }
    } catch (error) {
      Logger.error(`❌ Failed to send message to client: ${error}`);
      this.clients.delete(ws);
    }
  }

  private startGameCycle() {
    const loop = async () => {
      // Check if game is paused/stopped
      if (!this.gameStateManager.isRunning()) {
        console.log(`⏸️ Game is ${this.gameStateManager.getState()}, waiting...`);
        setTimeout(loop, 1000); // Check again in 1 second
        return;
      }

      this.roundActive = true;
      this.currentRoundStartTime = Date.now();
      this.currentRoundEndTime = this.currentRoundStartTime + CONFIG.ROUND_DURATION;
      
      console.log(`🕒 New round started (${CONFIG.ROUND_DURATION} ms) - Clients: ${this.clients.size} - State: ${this.gameStateManager.getState()}`);
      this.broadcast<RoundStartMessage>({
        action: 'roundStart',
        timeLeft: CONFIG.ROUND_DURATION,
      });

      // Wait for round duration, but check game state periodically
      const startTime = Date.now();
      const checkInterval = 1000; // Check every second
      
      while (Date.now() - startTime < CONFIG.ROUND_DURATION) {
        if (!this.gameStateManager.isRunning()) {
          console.log('⏸️ Game paused during round, waiting...');
          this.roundActive = false;
          
          // Wait until game resumes
          while (!this.gameStateManager.isRunning()) {
            await new Promise(res => setTimeout(res, 1000));
          }
          
          // Resume round
          console.log('▶️ Game resumed, continuing round...');
          this.roundActive = true;
        }
        
        await new Promise(res => setTimeout(res, Math.min(checkInterval, CONFIG.ROUND_DURATION - (Date.now() - startTime))));
      }

      // Only process spins if game is still running
      if (this.gameStateManager.isRunning()) {
        const spins = [...spinQueue];
        spinQueue.length = 0;

        if (spins.length === 0) {
          const randomIndex = Math.floor(Math.random() * 37); // 0-36 for European roulette
          console.log(`🎲 No rigged spins. Using random: ${randomIndex}`);
          this.broadcast<SpinMessage>({ action: 'spin', index: randomIndex });
          
          // Wait for frontend animation to complete + buffer time
          const spinWaitTime = CONFIG.FRONTEND_SPIN_DURATION + CONFIG.SPIN_BUFFER_TIME;
          console.log(`⏳ Waiting ${spinWaitTime}ms for frontend animation to complete`);
          await new Promise((res) => setTimeout(res, spinWaitTime));
        } else {
          console.log(`🌀 Processing ${spins.length} rigged spins`);
          for (const index of spins) {
            // Check if game is still running before each spin
            if (!this.gameStateManager.isRunning()) {
              console.log('⏸️ Game paused during spin processing, stopping...');
              // Put remaining spins back in queue
              spinQueue.unshift(index, ...spins.slice(spins.indexOf(index) + 1));
              break;
            }
            
            this.broadcast<SpinMessage>({ action: 'spin', index });
            
            // Wait for frontend animation to complete + buffer time
            const spinWaitTime = CONFIG.FRONTEND_SPIN_DURATION + CONFIG.SPIN_BUFFER_TIME;
            console.log(`⏳ Waiting ${spinWaitTime}ms for frontend animation to complete`);
            await new Promise((res) => setTimeout(res, spinWaitTime));
          }
        }
      }

      // Mark round as completed
      this.roundActive = false;
      console.log('🏁 Round completed, entering waiting period');

      // Wait before starting next round (only if game is running)
      if (this.gameStateManager.isRunning()) {
        console.log(`⏳ Waiting ${CONFIG.WAITING_PERIOD}ms before starting next round`);
        setTimeout(loop, CONFIG.WAITING_PERIOD);
      } else {
        setTimeout(loop, 1000); // Check more frequently if paused
      }
    };

    loop();
  }

  private broadcast<T>(message: T) {
    const json = JSON.stringify(message);
    const deadClients: WSWebSocket[] = [];
    
    this.clients.forEach((ws) => {
      try {
        if (ws.readyState === ws.OPEN) {
          ws.send(json);
        } else {
          deadClients.push(ws);
        }
      } catch (error) {
        Logger.error(`❌ Failed to broadcast to client: ${error}`);
        deadClients.push(ws);
      }
    });

    // Remove dead clients
    deadClients.forEach(ws => {
      this.clients.delete(ws);
      Logger.warn('🗑️ Removed dead client from broadcast list');
    });

    if (deadClients.length > 0) {
      console.log(`📡 Broadcast sent to ${this.clients.size} clients (${deadClients.length} removed)`);
    }
  }

  public start() {
    this.server.listen(CONFIG.PORT, () => {
      console.log(`🚀 Game server ready at http://localhost:${CONFIG.PORT}`);
    });
  }
}
