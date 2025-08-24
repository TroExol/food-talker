import { environment } from '../config/environment';

export class ConsoleLogger {
  private static logLevel = environment.LOG_LEVEL;

  private static shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private static formatMessage(level: string, message: string, meta?: object): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
  }

  public static info(message: string, meta?: object): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, meta));
    }
  }

  public static warn(message: string, meta?: object): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, meta));
    }
  }

  public static error(message: string, error?: Error, meta?: object): void {
    if (this.shouldLog('error')) {
      const errorMeta = error ? { ...(meta || {}), error: error.message, stack: error.stack } : meta;
      console.error(this.formatMessage('error', message, errorMeta));
    }
  }

  public static debug(message: string, meta?: object): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, meta));
    }
  }
}
