import { Telegraf } from 'telegraf';

import { MessageFormatterFactory } from '@/services/message/MessageFormatter/MessageFormatterFactory';
import { environment } from '@/config/environment';

import { AdminNotificationService } from './AdminNotificationService';

export class AdminNotificationServiceFactory {
  private static instance: AdminNotificationService;

  public static getInstance(): AdminNotificationService {
    if (!AdminNotificationServiceFactory.instance) {
      AdminNotificationServiceFactory.instance = new AdminNotificationService(
        new Telegraf(environment.BOT_TOKEN),
        MessageFormatterFactory.getInstance(),
      );
    }
    return AdminNotificationServiceFactory.instance;
  }
}
