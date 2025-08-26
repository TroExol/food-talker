import { CacheServiceFactory } from '@/services/cacheService/CacheServiceFactory';

import { YESearchService } from './YESearchService';
import { YEApiServiceFactory } from '../yeApiService/YEApiServiceFactory';

export class YESearchServiceFactory {
  private static instance: YESearchService | null = null;

  static getInstance = async (): Promise<YESearchService> => {
    if (!YESearchServiceFactory.instance) {
      YESearchServiceFactory.instance = new YESearchService(
        await YEApiServiceFactory.getInstance(),
        CacheServiceFactory.getRedisInstance(),
      );
    }
    return YESearchServiceFactory.instance;
  };
}
