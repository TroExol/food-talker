import { vectorSearchService } from '@/services/vectorSearch/instances';
import { UserServiceFactory } from '@/services/user/UserServiceFactory';
import { yeSearchService } from '@/services/platforms/yandexEda/yeSearchService/instances';
import { yeApiService } from '@/services/platforms/yandexEda/yeApiService/instances';
import { redisCacheService } from '@/services/cacheService/instances';

import { SearchService } from './SearchService';
import { llmService } from '../LLMService/instances';

export class SearchServiceFactory {
  private static instance: SearchService | null = null;

  static getInstance = async (): Promise<SearchService> => {
    if (!SearchServiceFactory.instance) {
      const userService = await UserServiceFactory.getInstance();
      return new SearchService(
        llmService,
        yeApiService,
        yeSearchService,
        userService,
        redisCacheService,
        vectorSearchService,
      );
    }
    return SearchServiceFactory.instance;
  };

  static resetInstance = (): void => {
    SearchServiceFactory.instance = null;
  };
}
