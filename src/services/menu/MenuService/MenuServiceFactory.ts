import { EmbeddingServiceFactory } from '@/services/EmbeddingService/EmbeddingServiceFactory';

import { MenuService } from './MenuService';
import { MenuRepositoryFactory } from '../MenuRepository/MenuRepositoryFactory';

export class MenuServiceFactory {
  private static instance: MenuService | null = null;

  static getInstance = async (): Promise<MenuService> => {
    if (!MenuServiceFactory.instance) {
      MenuServiceFactory.instance = new MenuService(
        await MenuRepositoryFactory.getInstance(),
        EmbeddingServiceFactory.getInstance(),
      );
    }
    return MenuServiceFactory.instance;
  };

  static resetInstance = (): void => {
    MenuServiceFactory.instance = null;
  };
}
