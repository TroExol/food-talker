import {
  NeuralRequestLoggingServiceFactory,
} from '@/services/NeuralRequestLoggingService/NeuralRequestLoggingServiceFactory';
import { CacheServiceFactory } from '@/services/cacheService/CacheServiceFactory';

import { LLMService } from './LLMService';

export class LLMServiceFactory {
  private static instance: LLMService | null = null;

  static getInstance = async (): Promise<LLMService> => {
    if (!LLMServiceFactory.instance) {
      LLMServiceFactory.instance = new LLMService(
        CacheServiceFactory.getRedisInstance(),
        await NeuralRequestLoggingServiceFactory.getInstance(),
        {
          systemPrompt: 'Ты - помощник для поиска еды',
          timeoutMs: 40000,
        },
      );
    }
    return LLMServiceFactory.instance;
  };
}
