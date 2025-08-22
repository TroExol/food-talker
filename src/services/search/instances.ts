import { UserServiceFactory } from '@/services/user/UserServiceFactory';
import { cachedYEService } from '@/services/data/yandexEda/cachedYEService/instances';
import { redisCacheService } from '@/services/data/cache/cacheService/instances';

import { SearchService } from './SearchService';
import { llmService } from './LLMService/instances';

// Функция для создания SearchService с асинхронными зависимостями
export const createSearchService = async (): Promise<SearchService> => {
  const userService = await UserServiceFactory.getInstance();
  return new SearchService(
    llmService,
    cachedYEService,
    userService,
    redisCacheService,
  );
};

// Экспортируем promise для удобства использования
export const searchServicePromise = createSearchService();
