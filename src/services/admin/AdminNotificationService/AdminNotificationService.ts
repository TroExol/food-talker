import type { Telegraf } from 'telegraf';

import type { AppError } from '@/utils/AppError';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { environment } from '@/config/environment';

export class AdminNotificationService {
  constructor(
    private readonly bot: Telegraf,
  ) {}

  public notifyAdmin = async (error: AppError, context?: Record<string, unknown>): Promise<void> => {
    if (!environment.ADMIN_TELEGRAM_ID) {
      ConsoleLogger.warn('ADMIN_TELEGRAM_ID не установлен, уведомление админу не отправлено');
      return;
    }

    try {
      const message = this.formatErrorMessage(error, context);
      await this.bot.telegram.sendMessage(environment.ADMIN_TELEGRAM_ID, message, {
        parse_mode: 'HTML',
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
      const message = this.formatSystemErrorMessage(error, context);
      await this.bot.telegram.sendMessage(environment.ADMIN_TELEGRAM_ID, message, {
        parse_mode: 'HTML',
      });
    } catch (notificationError) {
      ConsoleLogger.error('Не удалось отправить уведомление админу:', notificationError as Error);
    }
  };

  private formatErrorMessage = (error: AppError, context?: Record<string, unknown>): string => {
    const timestamp = new Date().toISOString();
    const contextStr = context ? `\n<b>Контекст:</b> <code>${JSON.stringify(context, null, 2)}</code>` : '';

    return `🚨 <b>Критическая ошибка</b>

<b>Тип:</b> ${error.type}
<b>Код:</b> ${error.code}
<b>Сообщение:</b> ${error.message}
<b>Время:</b> ${timestamp}${contextStr}

<b>Стек:</b>
<code>${error.stack || 'Недоступен'}</code>`;
  };

  private formatSystemErrorMessage(error: Error, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? `\n<b>Контекст:</b> <code>${JSON.stringify(context, null, 2)}</code>` : '';

    return `⚠️ <b>Системная ошибка</b>

<b>Сообщение:</b> ${error.message}
<b>Время:</b> ${timestamp}${contextStr}

<b>Стек:</b>
<code>${error.stack || 'Недоступен'}</code>`;
  }
}
