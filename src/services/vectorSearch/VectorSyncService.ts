import type { TMenuItem } from '@/types/menuItem';

import { ConsoleLogger } from '@/utils/ConsoleLogger';

import type { VectorSearchService } from './VectorSearchService';

export class VectorSyncService {
  constructor(
    private readonly vectorSearchService: VectorSearchService,
  ) {}

  public async syncMenu(menu: TMenuItem[]): Promise<void> {
    try {
      ConsoleLogger.info('Начинаем синхронизацию всех блюд с векторной базой', { menuCount: menu.length });

      let syncedDishes = 0;

      // Синхронизируем блюда из каждого ресторана
      for (const menuItem of menu) {
        try {
          ConsoleLogger.debug('Синхронизируем блюда ресторана', {
            menuItemId: menuItem.id,
            menuItemName: menuItem.name,
          });

          await this.vectorSearchService.upsertMenuItem(menuItem);
          syncedDishes++;
        } catch (error) {
          ConsoleLogger.error('Ошибка синхронизации блюда', error as Error, {
            menuItemId: menuItem.id,
            menuItemName: menuItem.name,
          });
        }
      }

      ConsoleLogger.info('Синхронизация завершена', {
        menuCount: menu.length,
        syncedDishes,
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка синхронизации всех блюд', error as Error, { menuCount: menu.length });
      throw error;
    }
  }

  public async deleteMenuItem(menuItemId: string): Promise<void> {
    try {
      ConsoleLogger.debug('Удаляем блюдо из векторной базы', { menuItemId });

      await this.vectorSearchService.deleteMenuItem(menuItemId);

      ConsoleLogger.debug('Блюдо успешно удалено из векторной базы', { menuItemId });
    } catch (error) {
      ConsoleLogger.error('Ошибка удаления блюда из векторной базы', error as Error, { menuItemId });
      throw error;
    }
  }

  public async getSyncStats(): Promise<{
    totalMenuItems: number;
    lastSyncDate?: Date;
  }> {
    try {
      const totalMenuItems = await this.vectorSearchService.getMenuCount();

      return {
        totalMenuItems,
      };
    } catch (error) {
      ConsoleLogger.error('Ошибка получения статистики синхронизации', error as Error);
      throw error;
    }
  }
}
