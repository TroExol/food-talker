import { MenuServiceFactory } from '@/services/menu/MenuService/MenuServiceFactory';
import { CacheServiceFactory } from '@/services/cacheService/CacheServiceFactory';
import { ApiRequestLoggingServiceFactory } from '@/services/ApiRequestLoggingService/ApiRequestLoggingServiceFactory';

import { YEApiService } from './YEApiService';
import { YEDataTransformerFactory } from '../yeDataTransformer/YEDataTransformerFactory';

export class YEApiServiceFactory {
  private static instance: YEApiService | null = null;

  static getInstance = async (): Promise<YEApiService> => {
    if (!YEApiServiceFactory.instance) {
      YEApiServiceFactory.instance = new YEApiService(
        CacheServiceFactory.getRedisInstance(),
        await YEDataTransformerFactory.getInstance(),
        await MenuServiceFactory.getInstance(),
        await ApiRequestLoggingServiceFactory.getInstance(),
      );
    }
    return YEApiServiceFactory.instance;
  };
}
