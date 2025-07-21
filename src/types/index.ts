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

export interface SpinResult {
  id?: string;
  spin_number: number;
  color: string;
  parity: string;
  is_deleted?: boolean;
  deleted_at?: string;
  timestamp?: string;
  created_at?: string;
}

export interface LastSpinResultsMessage {
  action: 'lastSpinResults';
  results: SpinResult[];
}
