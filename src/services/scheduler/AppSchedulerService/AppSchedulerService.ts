import type { UserRepository } from '@/services/user/UserRepository/UserRepository';
import type {
  YEDataCollectionService,
} from '@/services/platforms/yandexEda/yeDataCollectionService/YEDataCollectionService';
import type { MenuRepository } from '@/services/menu/MenuRepository/MenuRepository';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';

import type { SchedulerService } from '../SchedulerService/SchedulerService';

export class AppSchedulerService {
  constructor(
    private readonly schedulerService: SchedulerService,
    private readonly yeDataCollectionService: YEDataCollectionService,
    private readonly menuRepository: MenuRepository,
    private readonly userRepository: UserRepository,
  ) { }

  public startAllJobs = (): void => {
    try {
      ConsoleLogger.info('Настройка задач планировщика приложения');

      // Добавляем задачи в планировщик
      this.setupYEDataCollectionJobs();
      this.setupCleanupJobs();
      this.setupUnavailableExpiredDishesJobs();

      // Запускаем все задачи
      this.schedulerService.startAllJobs();

      ConsoleLogger.info('Все задачи приложения запущены');
    } catch (error) {
      ConsoleLogger.error('Ошибка запуска задач приложения', error as Error);
      throw AppError.systemError('APP_SCHEDULER_START_FAILED', 'Не удалось запустить задачи приложения');
    }
  };

  public stopAllJobs = (): void => {
    try {
      this.schedulerService.stopAllJobs();
      ConsoleLogger.info('Все задачи приложения остановлены');
    } catch (error) {
      ConsoleLogger.error('Ошибка остановки задач приложения', error as Error);
      throw AppError.systemError('APP_SCHEDULER_STOP_FAILED', 'Не удалось остановить задачи приложения');
    }
  };

  public initialLoad = async (): Promise<void> => {
    try {
      await Promise.allSettled([
        // TODO: подумать над необходимостью очистки просроченных блюд
        // this.menuRepository.cleanupExpiredDishes(),
        this.menuRepository.unavailableExpiredDishes(),
        this.yeDataCollectionService.updateRestaurants(),
        this.userRepository.cleanupExpiredSubscriptions(),
      ]);
    } catch (error) {
      ConsoleLogger.error('Ошибка при загрузке данных приложения', error as Error);
      throw AppError.systemError('APP_SCHEDULER_INITIAL_LOAD_FAILED', 'Не удалось загрузить данные приложения');
    }
  };

  public getJobStats = (): {
    totalJobs: number;
    runningJobs: number;
    stoppedJobs: number;
    totalErrors: number;
  } => {
    return this.schedulerService.getJobStats();
  };

  private setupYEDataCollectionJobs = (): void => {
    this.schedulerService.addJob({
      id: 'ye-restaurants-update',
      name: 'Обновление данных ресторанов Яндекс.Еда',
      cronExpression: '*/30 * * * *', // 00:00, 00:30, 01:00, 01:30
      task: async () => {
        ConsoleLogger.info('Начало запланированного обновления данных ресторанов Яндекс.Еда');
        await this.yeDataCollectionService.updateRestaurants();
      },
    });
  };

  private setupUnavailableExpiredDishesJobs = (): void => {
    this.schedulerService.addJob({
      id: 'unavailable-expired-dishes',
      name: 'Установка недоступными просроченные блюда',
      cronExpression: `20,50 * * * *`, // 00:20, 00:50, 01:20, 01:50
      task: async () => {
        ConsoleLogger.info('Начало запланированной установки недоступными просроченных блюд');
        await this.menuRepository.unavailableExpiredDishes();
      },
    });
  };

  private setupCleanupJobs = (): void => {
    // TODO: подумать над необходимостью очистки просроченных блюд
    // this.schedulerService.addJob({
    //   id: 'cleanup-expired-dishes',
    //   name: 'Очистка просроченных блюд',
    //   cronExpression: `*/${botConfig.cache.ttlMenu / 60} * * * *`,
    //   task: async () => {
    //     ConsoleLogger.info('Начало запланированной очистки просроченных блюд');
    //     await this.menuRepository.cleanupExpiredDishes();
    //   },
    // });

    this.schedulerService.addJob({
      id: 'cleanup-expired-subscriptions',
      name: 'Очистка просроченных подписок',
      cronExpression: `0 0 * * *`, // каждый день в 00:00
      task: async () => {
        ConsoleLogger.info('Начало запланированной очистки просроченных подписок');
        await this.userRepository.cleanupExpiredSubscriptions();
      },
    });
  };
}
