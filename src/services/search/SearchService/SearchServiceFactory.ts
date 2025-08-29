import { UserServiceFactory } from '@/services/user/UserServiceFactory';
import { VectorSearchServiceFactory } from '@/services/search/VectorSearchService/VectorSearchServiceFactory';
import { YESearchServiceFactory } from '@/services/platforms/yandexEda/yeSearchService/YESearchServiceFactory';
import { YEApiServiceFactory } from '@/services/platforms/yandexEda/yeApiService/YEApiServiceFactory';
import { CacheServiceFactory } from '@/services/cacheService/CacheServiceFactory';
import { AnalyticsServiceFactory } from '@/services/analytics/AnalyticsService/AnalyticsServiceFactory';

import { SearchService } from './SearchService';
import { LLMServiceFactory } from '../../LLMService/LLMServiceFactory';

export class SearchServiceFactory {
  private static instance: SearchService | null = null;

  static getInstance = async (): Promise<SearchService> => {
    if (!SearchServiceFactory.instance) {
      return new SearchService(
        await LLMServiceFactory.getInstance(),
        await YEApiServiceFactory.getInstance(),
        await YESearchServiceFactory.getInstance(),
        await UserServiceFactory.getInstance(),
        CacheServiceFactory.getRedisInstance(),
        await VectorSearchServiceFactory.getInstance(),
        AnalyticsServiceFactory.getInstance(),
      );
    }
    return SearchServiceFactory.instance;
  };

  static resetInstance = (): void => {
    SearchServiceFactory.instance = null;
  };
}
