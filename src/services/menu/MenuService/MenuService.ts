import type { TSearchResultItem } from '@/types/search';
import type { TMenuItem } from '@/types/menuItem';
import type { LightRAGService } from '@/services/LightRAGService/LightRAGService';
import type { EmbeddingService } from '@/services/EmbeddingService/EmbeddingService';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';

import type {
  TMenuSearchOptions,
  TVectorMenuItem,
  TVectorMenuSearchOptions,
  TVectorSearchResultItem,
} from '../MenuRepository/types';
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
    private readonly embeddingService: EmbeddingService,
  ) { }

  public createMenuItemToRAG = async (menuItem: TMenuItem): Promise<TVectorMenuItem> => {
    try {
      const textForEmbedding = `${menuItem.name} ${menuItem.description} ${menuItem.ingredients.join(', ')} ${menuItem.category}`.trim();
      const embedding = await this.embeddingService.generateEmbeddingOpenAI(textForEmbedding);

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

  public createMenuToRAG = async (menu: TMenuItem[]): Promise<void> => {
    try {
      if (menu.length === 0) return;

      const menuToCreateObj = menu.reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {} as Record<string, TMenuItem>);

      const alreadyExists = await this.menuRepository.search({
        ids: Object.keys(menuToCreateObj),
        available: null,
        limit: null,
        deliveryRadiusKm: null,
        showExpired: true,
      });

      const nonEmbeddingUpdates: TMenuItem[] = [];

      alreadyExists.forEach(item => {
        const menuItemToCreate = menuToCreateObj[item.id];
        if (
          menuItemToCreate
          && menuItemToCreate.name === item.name
          && menuItemToCreate.description === item.description
          && menuItemToCreate.ingredients.toString() === item.tags.toString()
          && menuItemToCreate.category === item.category
        ) {
          nonEmbeddingUpdates.push(menuItemToCreate);
          delete menuToCreateObj[item.id];
        }
      });

      if (nonEmbeddingUpdates.length > 0) {
        await this.menuRepository.updateBulk(nonEmbeddingUpdates.map(item => ({
          id: item.id,
          updates: item,
        })));
      }

      const menuWithExistsEmbedding = await this.mapMenuWithExistsEmbedding(Object.values(menuToCreateObj));

      menuWithExistsEmbedding.forEach(item => {
        delete menuToCreateObj[item.id];
      });

      if (menuWithExistsEmbedding.length > 0) {
        await this.menuRepository.createBulk(menuWithExistsEmbedding);
      }

      const menuToCreate = Object.values(menuToCreateObj);

      if (menuToCreate.length === 0) {
        ConsoleLogger.debug('Не создаем блюда, так как нет новых блюд', {
          restaurantNames: menuToCreate.map(item => item.restaurant.name),
          menuItemCount: menu.length,
          alreadyExistsCount: alreadyExists.length,
          menuItemCountToCreate: Object.values(menuToCreateObj).length,
          nonEmbeddingUpdatesCount: nonEmbeddingUpdates.length,
          menuWithExistsEmbeddingCount: menuWithExistsEmbedding.length,
        });
        return;
      }

      // Подготавливаем тексты для embedding
      const textsForEmbedding = menuToCreate.map(item =>
        `${item.name}${item.description ? ` ${item.description}` : ''} ${item.ingredients.join(', ')} ${item.category}`.trim(),
      );

      // Генерируем embedding батчем
      const embeddings = await this.embeddingService.generateEmbeddingsBatchOpenAI(textsForEmbedding);

      // Создаем векторные элементы меню
      const vectorMenu: TVectorMenuItem[] = menuToCreate.map((item, index) => ({
        ...item,
        embedding: embeddings[index],
      }));

      await this.menuRepository.createBulk(vectorMenu);

      ConsoleLogger.info('Меню создано с батч embedding', {
        restaurantNames: [...new Set(menuToCreate.map(item => item.restaurant.name))],
        menuItemCount: menu.length,
        alreadyExistsCount: alreadyExists.length,
        menuItemCountToCreate: menuToCreate.length,
        embeddingCount: embeddings.length,
        menuWithExistsEmbeddingCount: menuWithExistsEmbedding.length,
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка создания блюд', error as Error, { menuItemCount: menu.length });
      throw AppError.systemError('MENU_CREATION_FAILED', 'Не удалось создать блюда');
    }
  };

  private mapMenuWithExistsEmbedding = async (menu: TMenuItem[]): Promise<TVectorMenuItem[]> => {
    if (menu.length === 0) return [];

    // Получаем все блюда с эмбедингами из базы данных по названиям ресторанов
    const restaurantsMenu = await this.menuRepository.searchWithEmbeddings({
      restaurantNames: [...new Set(menu.map(item => item.restaurant.name))],
      available: null,
      limit: null,
      deliveryRadiusKm: null,
      showExpired: true,
    });

    const restaurantsMenuObject = restaurantsMenu.reduce((acc, item) => {
      acc[`${item.name}-${item.description}-${item.ingredients.toString()}-${item.category}`] = item;
      return acc;
    }, {} as Record<string, TVectorMenuItem>);

    const existsEmbeddings: TVectorMenuItem[] = [];

    // Проходим по каждому блюду из входного массива
    for (const menuItem of menu) {
      // Ищем совпадение в результатах поиска
      const existingItem = restaurantsMenuObject[`${menuItem.name}-${menuItem.description}-${menuItem.ingredients.toString()}-${menuItem.category}`];

      if (!existingItem) {
        continue;
      }

      // Преобразуем TSearchResultItem в TVectorMenuItem
      const vectorMenuItem: TVectorMenuItem = {
        id: menuItem.id,
        name: menuItem.name,
        description: menuItem.description,
        ingredients: menuItem.ingredients, // ingredients уже в правильном формате
        price: menuItem.price,
        image: menuItem.image,
        available: menuItem.available,
        restaurant: {
          id: menuItem.restaurant.id,
          name: menuItem.restaurant.name,
          coordinates: menuItem.restaurant.coordinates || {
            latitude: 0,
            longitude: 0,
          },
          lastUpdated: new Date(),
        },
        orderUrl: menuItem.orderUrl,
        category: menuItem.category,
        embedding: existingItem.embedding,
      };

      existsEmbeddings.push(vectorMenuItem);
    }

    ConsoleLogger.debug('Найдено существующих эмбедингов', {
      totalItems: menu.length,
      foundEmbeddings: existsEmbeddings.length,
    });

    return existsEmbeddings;
  };

  public createMenuItemToLightRAG = async (menuItem: TMenuItem): Promise<void> => {
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

  public createMenuToLightRAG = async (menu: TMenuItem[]): Promise<void> => {
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

  public searchMenuWithLightRAG = async (
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
