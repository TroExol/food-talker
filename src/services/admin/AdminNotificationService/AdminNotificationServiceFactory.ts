import { Telegraf } from 'telegraf';

import { environment } from '@/config/environment';

import { AdminNotificationService } from './AdminNotificationService';

export class AdminNotificationServiceFactory {
  private static instance: AdminNotificationService;

  public static getInstance(): AdminNotificationService {
    if (!AdminNotificationServiceFactory.instance) {
      const bot = new Telegraf(environment.BOT_TOKEN);
      AdminNotificationServiceFactory.instance = new AdminNotificationService(bot);
    }
    return AdminNotificationServiceFactory.instance;
  }
}
