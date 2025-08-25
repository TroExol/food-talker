import { UserServiceFactory } from '@/services/user/UserServiceFactory';
import { botConfig } from '@/config/bot';

import { Bot } from './Bot';

export class BotFactory {
  private static instance: Bot | null = null;

  public static async getInstance(): Promise<Bot> {
    if (!this.instance) {
      this.instance = new Bot(botConfig.telegramToken, await UserServiceFactory.getInstance());
    }

    return this.instance;
  }

  public static resetInstance = (): void => {
    BotFactory.instance = null;
  };
}
