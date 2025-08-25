import { ConsoleLogger } from './utils/ConsoleLogger';
import { validateEnvironment } from './config/environment';
import { BotFactory } from './bot/BotFactory';

// Валидация окружения
validateEnvironment();

async function main(): Promise<void> {
  try {
    ConsoleLogger.info('Запускаем Food Talker бота...');

    const bot = await BotFactory.getInstance();

    await bot.start();

    ConsoleLogger.info('Food Talker бот запущен. Нажмите Ctrl+C для остановки.');

    // Обработка graceful shutdown
    process.on('SIGINT', () => {
      ConsoleLogger.info('\nПолучен SIGINT. Завершаем работу...');
      bot.gracefulShutdown();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      ConsoleLogger.info('\nПолучен SIGTERM. Завершаем работу...');
      bot.gracefulShutdown();
      process.exit(0);
    });
  } catch (error) {
    ConsoleLogger.error('Не удалось запустить приложение:', error as Error);
    process.exit(1);
  }
}

// Запускаем приложение
main().catch(error => {
  ConsoleLogger.error('Необработанная ошибка:', error as Error);
  process.exit(1);
});
