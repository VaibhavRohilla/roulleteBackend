import { TelegramBotService } from './bot/TelegramBotService';
import { GameServer } from './server/GameServer';

new TelegramBotService();
new GameServer().start();
