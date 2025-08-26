import { EmbeddingServiceFactory } from '@/services/EmbeddingService/EmbeddingServiceFactory';
import { PostgreSQLFactory } from '@/services/database/PostgreSQL/PostgreSQLFactory';

import { MenuRepository } from './MenuRepository';

export class MenuRepositoryFactory {
  private static instance: MenuRepository | null = null;

  static getInstance = async (): Promise<MenuRepository> => {
    if (!MenuRepositoryFactory.instance) {
      MenuRepositoryFactory.instance = new MenuRepository(
        EmbeddingServiceFactory.getInstance(),
        await PostgreSQLFactory.getInstance(),
      );
    }
    return MenuRepositoryFactory.instance;
  };

  static resetInstance = (): void => {
    MenuRepositoryFactory.instance = null;
  };
}
