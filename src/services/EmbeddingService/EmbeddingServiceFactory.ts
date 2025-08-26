import { environment } from '@/config/environment';

import { EmbeddingService } from './EmbeddingService';

export class EmbeddingServiceFactory {
  private static instance: EmbeddingService | null = null;

  static getInstance = (): EmbeddingService => {
    if (!EmbeddingServiceFactory.instance) {
      EmbeddingServiceFactory.instance = new EmbeddingService({
        baseUrl: environment.EMBEDDING_API_BASE_URL,
        apiKey: environment.EMBEDDING_API_KEY,
        modelName: environment.EMBEDDING_MODEL_NAME,
      });
    }
    return EmbeddingServiceFactory.instance;
  };
}
