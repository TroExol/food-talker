import { MenuServiceFactory } from '@/services/menu/MenuService/MenuServiceFactory';
import { EmbeddingServiceFactory } from '@/services/EmbeddingService/EmbeddingServiceFactory';

import { VectorSearchService } from './VectorSearchService';

export class VectorSearchServiceFactory {
  private static instance: VectorSearchService | null = null;

  static getInstance = async (): Promise<VectorSearchService> => {
    if (!VectorSearchServiceFactory.instance) {
      VectorSearchServiceFactory.instance = new VectorSearchService(
        await MenuServiceFactory.getInstance(),
        await EmbeddingServiceFactory.getInstance(),
      );
    }
    return VectorSearchServiceFactory.instance;
  };
}
