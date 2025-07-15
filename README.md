# 🎰 Telegram Roulette Backend

A comprehensive WebSocket-based roulette game server with Telegram bot integration for queue management and Supabase audit logging.

## ✨ Features

### 🌐 WebSocket Game Server
- Real-time roulette game with 60-second rounds
- Automatic reconnection and state synchronization
- Client heartbeat monitoring
- CORS-enabled for frontend connections

### 🤖 Telegram Bot Controls
- **Queue Management**: Add, delete, and clear spins
- **Game Control**: Pause, resume, and reset game state
- **Audit Logging**: All actions logged to Supabase
- **Admin-only**: Secure command access

### 📊 Supabase Integration
- Complete audit trail of all bot actions
- Failed and successful operation tracking
- User activity monitoring
- Detailed before/after value logging

## 🚀 Quick Start

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Setup Supabase:**
   - Follow instructions in `SUPABASE_SETUP.md`
   - Create database table and configure credentials

4. **Start Development:**
   ```bash
   npm run dev
   ```

5. **Production Build:**
   ```bash
   npm run build
   npm start
   ```

## 🤖 Bot Commands

### 📋 Queue Management
- `spin: <0-36>` - Add number to spin queue
- `/status` - Show game status and queue
- `/delete_queue` - Clear entire queue
- `/delete <number>` - Remove specific number from queue

### 🎮 Game Control
- `/resume` - Resume paused game
- `/stop` - Pause game rounds
- `/reset` - Reset queue and resume game

### ℹ️ Information
- `/help` - Show command help

## 🔧 Configuration

### Environment Variables
```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token
ADMINS=123456789,987654321

# Server
PORT=3001
ROUND_DURATION=60000

# Supabase (optional)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
```

### Game Settings
- **Round Duration**: 60 seconds (configurable)
- **Roulette Numbers**: 0-36 (European roulette)
- **Waiting Period**: 3 seconds between rounds
- **Auto-reconnection**: 5 attempts with exponential backoff

## 📡 API Endpoints

### Health Check
```
GET /health
```
Response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "roundActive": true,
  "gameState": "running",
  "connectedClients": 5,
  "queuedSpins": 2
}
```

### Game Status
```
GET /status
```
Response:
```json
{
  "roundActive": true,
  "gameState": "running", 
  "connectedClients": 5,
  "queuedSpins": 2,
  "queue": [17, 23],
  "isGameRunning": true,
  "statusMessage": "▶️ Game Status: RUNNING\n📋 Queue: 2 spins"
}
```

## 🔌 WebSocket Messages

### From Server
```json
// Round start
{"action": "roundStart", "timeLeft": 60000}

// Spin result  
{"action": "spin", "index": 17}

// Game state (for reconnection)
{"action": "gameState", "roundActive": true, "timeLeft": 45000, "connectedClients": 5, "queuedSpins": 2}

// Heartbeat response
{"action": "pong", "timestamp": 1641024000000}
```

### From Client
```json
// Request current state
{"action": "requestGameState"}

// Heartbeat
{"action": "ping"}
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Telegram Bot   │    │   WebSocket     │    │    Frontend     │
│                 │    │    Server       │    │    Clients      │
│ • Queue Mgmt    │────▶│                 │────▶│                 │
│ • Game Control  │    │ • Real-time     │    │ • Roulette UI   │
│ • Audit Logs    │    │ • Heartbeat     │    │ • Auto-sync     │
└─────────────────┘    │ • State Sync    │    │ • Reconnection  │
                       └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │    Supabase     │
                       │                 │
                       │ • Audit Logs    │
                       │ • User Actions  │
                       │ • Game History  │
                       └─────────────────┘
```

## 📊 Audit Logging

All bot actions are automatically logged to Supabase:

- **User Actions**: Who performed what action
- **Before/After Values**: Complete state changes
- **Success/Failure**: Operation outcomes
- **Timestamps**: When actions occurred
- **Details**: Human-readable descriptions

See `SUPABASE_SETUP.md` for database schema and queries.

## 🛡️ Security

- **Admin-only Bot**: Commands restricted to authorized users
- **Input Validation**: All inputs validated and sanitized  
- **Audit Trail**: Complete logging of all actions
- **Rate Limiting**: Built-in Telegram rate limiting
- **CORS Configuration**: Secure frontend connections

## 📦 Dependencies

### Runtime
- `express` - Web server
- `ws` - WebSocket server
- `node-telegram-bot-api` - Telegram bot
- `@supabase/supabase-js` - Database client
- `cors` - CORS middleware
- `dotenv` - Environment variables

### Development
- `typescript` - Type safety
- `ts-node-dev` - Development server
- `@types/*` - Type definitions

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is proprietary and confidential.
