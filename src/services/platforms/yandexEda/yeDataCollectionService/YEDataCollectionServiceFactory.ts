import { YEDataCollectionService } from './YEDataCollectionService';
import { YEApiServiceFactory } from '../yeApiService/YEApiServiceFactory';

export class YEDataCollectionServiceFactory {
  private static instance: YEDataCollectionService | null = null;

  static getInstance = async (): Promise<YEDataCollectionService> => {
    if (!YEDataCollectionServiceFactory.instance) {
      YEDataCollectionServiceFactory.instance = new YEDataCollectionService(
        await YEApiServiceFactory.getInstance(),
      );
    }
    return YEDataCollectionServiceFactory.instance;
  };
}
