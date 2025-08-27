import type { Telegraf } from 'telegraf';

import type { AppError } from '@/utils/AppError';
import type { MessageFormatterService } from '@/services/message/MessageFormatter/MessageFormatter';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { environment } from '@/config/environment';

export class AdminNotificationService {
  constructor(
    private readonly bot: Telegraf,
    private readonly messageFormatter: MessageFormatterService,
  ) {}

  public notifyAdmin = async (error: AppError, context?: Record<string, unknown>): Promise<void> => {
    if (!environment.ADMIN_TELEGRAM_ID) {
      ConsoleLogger.warn('ADMIN_TELEGRAM_ID не установлен, уведомление админу не отправлено');
      return;
    }

    try {
      const message = this.messageFormatter.formatAdminError(error, context);
      await this.bot.telegram.sendMessage(environment.ADMIN_TELEGRAM_ID, message.text, {
        parse_mode: message.parseMode,
        reply_markup: message.replyMarkup,
      });
    } catch (notificationError) {
      ConsoleLogger.error('Не удалось отправить уведомление админу:', notificationError as Error);
    }
  };

  public notifySystemError = async (error: Error, context?: Record<string, unknown>): Promise<void> => {
    if (!environment.ADMIN_TELEGRAM_ID) {
      ConsoleLogger.warn('ADMIN_TELEGRAM_ID не установлен, уведомление админу не отправлено');
      return;
    }

    try {
      const message = this.messageFormatter.formatAdminSystemError(error, context);
      console.log(environment.ADMIN_TELEGRAM_ID, message);
      await this.bot.telegram.sendMessage(environment.ADMIN_TELEGRAM_ID, message.text, {
        parse_mode: message.parseMode,
        reply_markup: message.replyMarkup,
      });
    } catch (notificationError) {
      ConsoleLogger.error('Не удалось отправить уведомление админу:', notificationError as Error);
    }
  };
}
