import type { TSearchResultItem } from '@/types/search';
import type { TMenuItem } from '@/types/menuItem';
import type { LightRAGService } from '@/services/LightRAGService/LightRAGService';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';

import type { TMenuSearchOptions } from '../MenuRepository/types';
import type { MenuRepository } from '../MenuRepository/MenuRepository';

export interface MenuSearchOptions {
  mode?: 'hybrid' | 'naive' | 'local' | 'global' | 'mix';
  enableRerank?: boolean;
  topK?: number;
  ids?: string[];
}

export interface MenuSearchResult {
  answer: string;
  context?: string[];
  sources?: string[];
  menuItems?: TMenuItem[];
}

export class MenuService {
  constructor(
    private readonly menuRepository: MenuRepository,
    private readonly lightRAGService: LightRAGService,
  ) { }

  public createMenuItem = async (menuItem: TMenuItem): Promise<void> => {
    try {
      const textForLightRAG = this.transformMenuItemsToText([menuItem])[0];

      // Создаем метаданные с полной информацией о блюде
      const metadata = {
        menuItem: menuItem,
        type: 'menu_item',
        createdAt: new Date().toISOString(),
      };

      // Добавляем блюдо в LightRAG с метаданными
      await this.lightRAGService.insertText(textForLightRAG, `Меню: ${menuItem.name}`, menuItem.id, metadata);

      ConsoleLogger.info('Блюдо добавлено в LightRAG с метаданными', { menuItemId: menuItem.id });
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
      if (menu.length === 0) return;

      // Подготавливаем тексты для LightRAG
      const textsForLightRAG = this.transformMenuItemsToText(menu);

      const ids = menu.map(item => item.id);
      const descriptions = menu.map(item => `Меню: ${item.name}`);
      const metadata = menu.map(item => ({
        menuItem: item,
        type: 'menu_item',
        createdAt: new Date().toISOString(),
      }));

      // Добавляем блюда в LightRAG батчем с метаданными
      await this.lightRAGService.insertTexts(textsForLightRAG, descriptions, ids, metadata);

      ConsoleLogger.info('Меню создано в LightRAG с метаданными', {
        menuItemCount: menu.length,
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка создания блюд', error as Error, { menuItemCount: menu.length });
      throw AppError.systemError('MENU_CREATION_FAILED', 'Не удалось создать блюда');
    }
  };

  public searchMenuWithRAG = async (
    query: string,
    options: MenuSearchOptions = {},
  ): Promise<MenuSearchResult> => {
    try {
      // Используем LightRAG для поиска
      const result = await this.lightRAGService.query(query, {
        mode: options.mode || 'hybrid',
        enableRerank: options.enableRerank ?? true,
        topK: options.topK || 40,
        ids: options.ids,
      });

      // Извлекаем блюда из метаданных
      const menuItems: TMenuItem[] = [];
      if (result.metadata) {
        for (const metadata of result.metadata) {
          if (metadata.menuItem && metadata.type === 'menu_item') {
            menuItems.push(metadata.menuItem as TMenuItem);
          }
        }
      }

      return {
        answer: result.answer,
        context: result.context,
        sources: result.sources,
        menuItems,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка поиска меню', error as Error, { query });
      throw AppError.systemError('MENU_SEARCH_FAILED', 'Не удалось выполнить поиск');
    }
  };

  public getMenuItems = async (options: TMenuSearchOptions = {}): Promise<TSearchResultItem[]> => {
    try {
      return this.menuRepository.search(options);
    } catch (error) {
      ConsoleLogger.error('Ошибка получения меню', error as Error);
      throw AppError.systemError('MENU_GET_FAILED', 'Не удалось получить меню');
    }
  };

  private transformMenuItemsToText = (menuItems: TMenuItem[]): string[] => {
    return menuItems.map(item =>
      `Название: ${item.name}
      Описание: ${item.description}
      Ресторан: ${item.restaurant.name}
      Ингредиенты: ${item.ingredients.join(', ')}
      Категория: ${item.category}`.trim(),
    );
  };
}
