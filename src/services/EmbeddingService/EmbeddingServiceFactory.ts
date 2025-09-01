import {
  NeuralRequestLoggingServiceFactory,
} from '@/services/NeuralRequestLoggingService/NeuralRequestLoggingServiceFactory';
import { environment } from '@/config/environment';

import { EmbeddingService } from './EmbeddingService';

export class EmbeddingServiceFactory {
  private static instance: EmbeddingService | null = null;

  static getInstance = async (): Promise<EmbeddingService> => {
    if (!EmbeddingServiceFactory.instance) {
      EmbeddingServiceFactory.instance = new EmbeddingService(
        await NeuralRequestLoggingServiceFactory.getInstance(),
        {
          baseUrl: environment.EMBEDDING_API_BASE_URL,
          apiKey: environment.EMBEDDING_API_KEY,
        },
      );
    }
    return EmbeddingServiceFactory.instance;
  };
}
