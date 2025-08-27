import { UserServiceFactory } from '@/services/user/UserServiceFactory';
import { SearchServiceFactory } from '@/services/search/SearchService/SearchServiceFactory';
import { MessageFormatterFactory } from '@/services/message/MessageFormatter/MessageFormatterFactory';
import {
  AdminNotificationServiceFactory,
} from '@/services/admin/AdminNotificationService/AdminNotificationServiceFactory';
import { environment } from '@/config/environment';

import { Bot } from './Bot';

export class BotFactory {
  private static instance: Bot | null = null;

  public static async getInstance(): Promise<Bot> {
    if (!this.instance) {
      this.instance = new Bot(
        environment.BOT_TOKEN,
        await UserServiceFactory.getInstance(),
        await SearchServiceFactory.getInstance(),
        MessageFormatterFactory.getInstance(),
        AdminNotificationServiceFactory.getInstance(),
      );
    }

    return this.instance;
  }

  public static resetInstance = (): void => {
    BotFactory.instance = null;
  };
}
