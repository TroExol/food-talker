import { UserServiceFactory } from '@/services/user/UserServiceFactory';
import { SearchServiceFactory } from '@/services/search/SearchService/SearchServiceFactory';
import { MessageFormatterFactory } from '@/services/message/MessageFormatter/MessageFormatterFactory';
import { botConfig } from '@/config/bot';

import { Bot } from './Bot';

export class BotFactory {
  private static instance: Bot | null = null;

  public static async getInstance(): Promise<Bot> {
    if (!this.instance) {
      const messageFormatter = new MessageFormatterFactory().createMessageFormatter();

      this.instance = new Bot(
        botConfig.telegramToken,
        await UserServiceFactory.getInstance(),
        await SearchServiceFactory.getInstance(),
        messageFormatter,
      );
    }

    return this.instance;
  }

  public static resetInstance = (): void => {
    BotFactory.instance = null;
  };
}
