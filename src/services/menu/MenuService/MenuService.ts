import type { TMenuItem } from '@/types/menuItem';
import type { EmbeddingService } from '@/services/EmbeddingService/EmbeddingService';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';

import type {
  TVectorMenuItem,
  TVectorMenuSearchOptions,
  TVectorSearchResultItem,
} from '../MenuRepository/types';
import type { MenuRepository } from '../MenuRepository/MenuRepository';

export class MenuService {
  constructor(
    private readonly menuRepository: MenuRepository,
    private readonly embeddingService: EmbeddingService,
  ) {}

  public createMenuItem = async (menuItem: TMenuItem): Promise<TVectorMenuItem> => {
    try {
      const textForEmbedding = `${menuItem.name} ${menuItem.description} ${menuItem.ingredients.join(', ')} ${menuItem.category}`.trim();
      const embedding = await this.embeddingService.generateEmbedding(textForEmbedding);

      // Создаем нового пользователя с базовыми настройками
      const menuItemData = {
        ...menuItem,
        embedding,
      };

      return await this.menuRepository.create(menuItemData);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка создания блюда', error as Error, { menuItemId: menuItem.id });
      throw AppError.systemError('MENU_ITEM_CREATION_FAILED', 'Не удалось создать блюдо');
    }
  };

  public createMenu = async (menu: TMenuItem[]): Promise<void> => {
    try {
      const vectorMenu: TVectorMenuItem[] = [];
      for (const item of menu) {
        const textForEmbedding = `${item.name} ${item.description} ${item.ingredients.join(', ')} ${item.category}`.trim();
        const embedding = await this.embeddingService.generateEmbedding(textForEmbedding);
        vectorMenu.push({
          ...item,
          embedding,
        });
      }
      await this.menuRepository.createBulk(vectorMenu);
    } catch (error) {
      ConsoleLogger.error('Ошибка создания блюд', error as Error, { menuItemCount: menu.length });
      throw AppError.systemError('MENU_CREATION_FAILED', 'Не удалось создать блюда');
    }
  };

  public getMenuItem = async (menuItemId: string): Promise<TVectorSearchResultItem | null> => {
    try {
      return await this.menuRepository.findById(menuItemId);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка получения блюда', error as Error, { menuItemId });
      throw AppError.systemError('MENU_ITEM_FETCH_FAILED', 'Не удалось получить блюдо');
    }
  };

  public searchByEmbedding = async (
    queryEmbedding: number[],
    options?: TVectorMenuSearchOptions,
  ): Promise<TVectorSearchResultItem[]> => {
    return await this.menuRepository.searchByEmbedding(queryEmbedding, options);
  };

  public deleteMenuItem = async (menuItemId: string): Promise<boolean> => {
    try {
      return await this.menuRepository.delete(menuItemId);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка удаления блюда', error as Error, { menuItemId });
      throw AppError.systemError('MENU_ITEM_DELETE_FAILED', 'Не удалось удалить блюдо');
    }
  };
}
