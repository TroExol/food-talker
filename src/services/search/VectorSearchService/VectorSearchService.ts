import type { TSearchResultItem } from '@/types/search';
import type { TMenuItem } from '@/types/menuItem';
import type { EmbeddingService } from '@/services/EmbeddingService/EmbeddingService';

import { ConsoleLogger } from '@/utils/ConsoleLogger';

import type { TVectorSearchOptions } from './types';
import type { MenuSearchOptions, MenuService } from '../../menu/MenuService/MenuService';

export class VectorSearchService {
  constructor(
    private readonly menuService: MenuService,
    private readonly embeddingService: EmbeddingService,
  ) { }

  public searchMenuWithRAG = async (
    naturalQuery: string,
    options?: Parameters<typeof this.menuService.searchMenuWithRAG>[1],
  ) => {
    try {
      // Генерируем эмбеддинг для запроса
      const queryEmbedding = await this.embeddingService.generateEmbedding(naturalQuery);

      const results = await this.menuService.searchMenuWithRAG(queryEmbedding, options);

      ConsoleLogger.debug('Векторный поиск выполнен', {
        query: naturalQuery,
        resultsCount: results.length,
        maxSimilarity: results[0]?.similarity,
      });

      return results;
    } catch (error) {
      ConsoleLogger.error('Ошибка векторного поиска', error as Error, { query: naturalQuery });
      throw error;
    }
  };

  public searchMenuWithLightRAG = async (
    naturalQuery: string,
    options?: TVectorSearchOptions,
  ): Promise<TSearchResultItem[]> => {
    try {
      const filteredMenu = await this.menuService.getMenuItems(options);

      const ragOptions: MenuSearchOptions = {
        ids: filteredMenu.map(item => item.id),
      };

      const results = await this.menuService.searchMenuWithLightRAG(naturalQuery, ragOptions);

      ConsoleLogger.debug('Векторный поиск выполнен', {
        query: naturalQuery,
        resultsCount: results.menuItems?.length,
      });

      return this.transformMenuItemsToSearchResultItems(results.menuItems || []);
    } catch (error) {
      ConsoleLogger.error('Ошибка векторного поиска', error as Error, { query: naturalQuery });
      throw error;
    }
  };

  private transformMenuItemsToSearchResultItems = (menuItems: TMenuItem[]): TSearchResultItem[] => {
    return menuItems.map(item => ({
      id: item.id,
      name: item.name,
      restaurant: item.restaurant,
      description: item.description,
      tags: item.ingredients,
      price: item.price,
      image: item.image,
      orderUrl: item.orderUrl,
      category: item.category,
      available: item.available,
    }));
  };
}
