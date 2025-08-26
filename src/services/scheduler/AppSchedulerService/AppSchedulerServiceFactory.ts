import {
  YEDataCollectionServiceFactory,
} from '@/services/platforms/yandexEda/yeDataCollectionService/YEDataCollectionServiceFactory';
import { MenuRepositoryFactory } from '@/services/menu/MenuRepository/MenuRepositoryFactory';

import { AppSchedulerService } from './AppSchedulerService';
import { SchedulerServiceFactory } from '../SchedulerService/SchedulerServiceFactory';

export class AppSchedulerServiceFactory {
  private static instance: AppSchedulerService | null = null;

  static getInstance = async (): Promise<AppSchedulerService> => {
    if (!AppSchedulerServiceFactory.instance) {
      AppSchedulerServiceFactory.instance = new AppSchedulerService(
        SchedulerServiceFactory.getInstance(),
        await YEDataCollectionServiceFactory.getInstance(),
        await MenuRepositoryFactory.getInstance(),
      );
    }
    return AppSchedulerServiceFactory.instance;
  };

  static resetInstance = (): void => {
    AppSchedulerServiceFactory.instance = null;
  };
}
