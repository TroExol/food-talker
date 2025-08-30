import { LightRAGServiceFactory } from '@/services/LightRAGService/LightRAGServiceFactory';

import { MenuService } from './MenuService';
import { MenuRepositoryFactory } from '../MenuRepository/MenuRepositoryFactory';

export class MenuServiceFactory {
  private static instance: MenuService | null = null;

  static getInstance = async (): Promise<MenuService> => {
    if (!MenuServiceFactory.instance) {
      MenuServiceFactory.instance = new MenuService(
        await MenuRepositoryFactory.getInstance(),
        LightRAGServiceFactory.getInstance(),
      );
    }
    return MenuServiceFactory.instance;
  };

  static resetInstance = (): void => {
    MenuServiceFactory.instance = null;
  };
}
