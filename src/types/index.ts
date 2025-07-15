export interface SpinMessage {
  action: 'spin';
  index: number;
}

export interface RoundStartMessage {
  action: 'roundStart';
  timeLeft: number;
}

export interface GameStateMessage {
  action: 'gameState';
  roundActive: boolean;
  timeLeft: number;
  connectedClients: number;
  queuedSpins: number;
}

export interface PongMessage {
  action: 'pong';
  timestamp: number;
}
