import type { InlineKeyboardMarkup } from 'telegraf/types';
import type { Context } from 'telegraf';

// Telegram Bot types
export type TTelegrafContext = Context;
export type TInlineKeyboardMarkup = InlineKeyboardMarkup;

// Bot handler interfaces
export interface TBotHandler {
  start(): Promise<void>;
  stop(): Promise<void>;
  handleMessage(ctx: TTelegrafContext): Promise<void>;
  handleCommand(ctx: TTelegrafContext): Promise<void>;
}
