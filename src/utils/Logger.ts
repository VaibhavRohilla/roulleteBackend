/**
 * 📝 Production-Ready Logger
 * Features: Log levels, timestamps, structured logging, environment-based configuration
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: any;
  stack?: string;
}

export class Logger {
  private static currentLevel: LogLevel = LogLevel.INFO;
  private static isProduction: boolean = process.env.NODE_ENV === 'production';

  static init(level?: LogLevel): void {
    Logger.currentLevel = level ?? (Logger.isProduction ? LogLevel.WARN : LogLevel.DEBUG);
    Logger.info('Logger initialized', { 
      level: LogLevel[Logger.currentLevel],
      environment: Logger.isProduction ? 'production' : 'development'
    });
  }

  private static formatTimestamp(): string {
    return new Date().toISOString();
  }

  private static formatMessage(level: string, message: string, context?: any): string {
    const entry: LogEntry = {
      timestamp: Logger.formatTimestamp(),
      level,
      message,
      ...(context && { context })
    };

    if (Logger.isProduction) {
      // JSON format for production (easier to parse by log aggregators)
      return JSON.stringify(entry);
    } else {
      // Human-readable format for development
      const contextStr = context ? ` ${JSON.stringify(context)}` : '';
      return `[${entry.timestamp}] ${level.toUpperCase().padEnd(5)} ${message}${contextStr}`;
    }
  }

  private static shouldLog(level: LogLevel): boolean {
    return level <= Logger.currentLevel;
  }

  static error(message: string, context?: any, error?: Error): void {
    if (!Logger.shouldLog(LogLevel.ERROR)) return;

    const logEntry = Logger.formatMessage('error', message, context);
    
    if (error?.stack) {
      console.error(`\x1b[31m${logEntry}\x1b[0m`);
      console.error(`\x1b[31mStack: ${error.stack}\x1b[0m`);
    } else {
      console.error(`\x1b[31m${logEntry}\x1b[0m`);
    }

    // In production, you might want to send to external logging service
    if (Logger.isProduction) {
      // TODO: Send to external logging service (e.g., Sentry, DataDog, etc.)
    }
  }

  static warn(message: string, context?: any): void {
    if (!Logger.shouldLog(LogLevel.WARN)) return;
    console.warn(`\x1b[33m${Logger.formatMessage('warn', message, context)}\x1b[0m`);
  }

  static info(message: string, context?: any): void {
    if (!Logger.shouldLog(LogLevel.INFO)) return;
    console.log(`\x1b[36m${Logger.formatMessage('info', message, context)}\x1b[0m`);
  }

  static debug(message: string, context?: any): void {
    if (!Logger.shouldLog(LogLevel.DEBUG)) return;
    console.log(`\x1b[37m${Logger.formatMessage('debug', message, context)}\x1b[0m`);
  }

  // Legacy methods for backward compatibility
  static log(message: string, context?: any): void {
    Logger.info(message, context);
  }

  // Performance monitoring helpers
  static time(label: string): void {
    if (Logger.shouldLog(LogLevel.DEBUG)) {
      console.time(`⏱️ ${label}`);
    }
  }

  static timeEnd(label: string): void {
    if (Logger.shouldLog(LogLevel.DEBUG)) {
      console.timeEnd(`⏱️ ${label}`);
    }
  }

  // Structured logging for specific events
  static apiRequest(method: string, path: string, duration?: number, status?: number): void {
    Logger.info('API Request', {
      method,
      path,
      duration,
      status
    });
  }

  static dbQuery(query: string, duration?: number, error?: boolean): void {
    if (error) {
      Logger.error('Database Query Failed', { query, duration });
    } else {
      Logger.debug('Database Query', { query, duration });
    }
  }

  static botAction(userId: number, username: string, action: string, success: boolean): void {
    Logger.info('Bot Action', {
      userId,
      username,
      action,
      success
    });
  }

  static gameEvent(event: string, data?: any): void {
    Logger.info('Game Event', {
      event,
      ...data
    });
  }
}

// Initialize logger on import
Logger.init();
