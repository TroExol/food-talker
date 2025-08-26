import { ConsoleLogger } from '@/utils/ConsoleLogger';

import type { MenuService } from '../../menu/MenuService/MenuService';
import type { EmbeddingService } from '../../EmbeddingService/EmbeddingService';

export class VectorSearchService {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly menuService: MenuService,
  ) { }

  public searchMenu = async (
    naturalQuery: string,
    options?: Parameters<typeof this.menuService.searchByEmbedding>[1],
  ) => {
    try {
      // Генерируем эмбеддинг для запроса
      const queryEmbedding = await this.embeddingService.generateEmbedding(naturalQuery);

      const results = await this.menuService.searchByEmbedding(queryEmbedding, options);

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
}
