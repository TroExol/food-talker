import { YEDataCollectionService } from './YEDataCollectionService';
import { YEDataTransformerFactory } from '../yeDataTransformer/YEDataTransformerFactory';
import { YEApiServiceFactory } from '../yeApiService/YEApiServiceFactory';

export class YEDataCollectionServiceFactory {
  private static instance: YEDataCollectionService | null = null;

  static getInstance = async (): Promise<YEDataCollectionService> => {
    if (!YEDataCollectionServiceFactory.instance) {
      YEDataCollectionServiceFactory.instance = new YEDataCollectionService(
        await YEApiServiceFactory.getInstance(),
        await YEDataTransformerFactory.getInstance(),
      );
    }
    return YEDataCollectionServiceFactory.instance;
  };

  static resetInstance = (): void => {
    YEDataCollectionServiceFactory.instance = null;
  };
}
