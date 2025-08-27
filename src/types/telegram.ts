import type { InlineKeyboardMarkup, Update } from 'telegraf/types';
import type { Context } from 'telegraf';

// Telegram Bot types
export type TTelegrafContext<T extends Update = Update> = Context<T>;
export type TInlineKeyboardMarkup = InlineKeyboardMarkup;

// Bot handler interfaces
export interface TBotHandler {
  start(): Promise<void>;
  stop(): Promise<void>;
  handleMessage(ctx: TTelegrafContext): Promise<void>;
  handleCommand(ctx: TTelegrafContext): Promise<void>;
}

// Bot command types
export enum EBotCommand {
  ADDRESS = 'address',
  HELP = 'help',
  HISTORY = 'history',
  START = 'start',
  SUPPORT = 'support',
}

// User session states
export enum EUserState {
  IDLE = 'idle',
  WAITING_FOR_CITY = 'waiting_for_city',
  WAITING_FOR_SEARCH_QUERY = 'waiting_for_search_query',
}

// Bot middleware context extension
export interface TBotContext<T extends Update = Update> extends TTelegrafContext<T> {
  user?: {
    telegramId: number;
    chatId: number;
    state: EUserState;
    city?: string;
  };
  rateLimit?: {
    requests: number;
    lastReset: number;
  };
}

// Rate limiting configuration
export interface TRateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  windowSizeMs: number;
}

// Bot command handler interface
export interface TCommandHandler {
  command: EBotCommand;
  description: string;
  handler: (ctx: TBotContext) => Promise<void>;
}

// Bot message handler interface
export interface TMessageHandler {
  pattern: RegExp | string;
  handler: (ctx: TBotContext) => Promise<void>;
}
