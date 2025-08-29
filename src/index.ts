import { sleep } from '@/utils/sleep';
import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppSchedulerServiceFactory } from '@/services/scheduler/AppSchedulerService/AppSchedulerServiceFactory';
import { validateEnvironment } from '@/config/environment';
import { BotFactory } from '@/bot/BotFactory';

import { AnalyticsServiceFactory } from './services/analytics/AnalyticsService/AnalyticsServiceFactory';
import {
  AdminNotificationServiceFactory,
} from './services/admin/AdminNotificationService/AdminNotificationServiceFactory';

// Валидация окружения
validateEnvironment();

async function main(): Promise<void> {
  const adminNotificationService = AdminNotificationServiceFactory.getInstance();
  const analyticsService = AnalyticsServiceFactory.getInstance();

  try {
    ConsoleLogger.info('Запускаем Food Talker бота...');

    const bot = await BotFactory.getInstance();
    const appSchedulerService = await AppSchedulerServiceFactory.getInstance();

    appSchedulerService.startAllJobs();
    // TODO: Uncomment this when we have a way to load the data
    // await appSchedulerService.initialLoad();

    void bot.start();

    ConsoleLogger.info('Food Talker бот запущен. Нажмите Ctrl+C для остановки.');

    // Обработка graceful shutdown
    const gracefulShutdown = async (signal: string): Promise<void> => {
      ConsoleLogger.info(`\nПолучен ${signal}. Завершаем работу...`);

      await analyticsService.gracefulShutdown();
      bot.gracefulShutdown();
      process.exit(0);
    };

    process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
  } catch (error) {
    ConsoleLogger.error('Ошибка работы приложения:', error as Error);

    await adminNotificationService.notifySystemError(error as Error);

    await sleep(1000);

    void main();
  }
}

// Обработка необработанных исключений
process.on('uncaughtException', error => {
  ConsoleLogger.error('Необработанное исключение:', error);

  void (async () => {
    try {
      const analytics = AnalyticsServiceFactory.getInstance();
      await analytics.gracefulShutdown();
    } catch (flushError) {
      ConsoleLogger.error('Ошибка при отправке аналитики при необработанном исключении:', flushError as Error);
    } finally {
      process.exit(1);
    }
  })();
});

// Обработка необработанных промисов
process.on('unhandledRejection', reason => {
  ConsoleLogger.error('Необработанный промис:', new Error(String(reason)));

  void (async () => {
    try {
      const analytics = AnalyticsServiceFactory.getInstance();
      await analytics.gracefulShutdown();
    } catch (flushError) {
      ConsoleLogger.error('Ошибка при отправке аналитики при необработанном промис:', flushError as Error);
    } finally {
      process.exit(1);
    }
  })();
});

// Запускаем приложение
void main();
