import { MenuServiceFactory } from '@/services/menu/MenuService/MenuServiceFactory';
import { CacheServiceFactory } from '@/services/cacheService/CacheServiceFactory';

import { YEApiService } from './YEApiService';
import { YEDataTransformerFactory } from '../yeDataTransformer/YEDataTransformerFactory';

export class YEApiServiceFactory {
  private static instance: YEApiService | null = null;

  static getInstance = async (): Promise<YEApiService> => {
    if (!YEApiServiceFactory.instance) {
      YEApiServiceFactory.instance = new YEApiService(
        CacheServiceFactory.getRedisInstance(),
        YEDataTransformerFactory.getInstance(),
        await MenuServiceFactory.getInstance(),
      );
    }
    return YEApiServiceFactory.instance;
  };
}
