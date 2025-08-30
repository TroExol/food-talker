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
          model: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
          systemPrompt: 'Ты - помощник для поиска еды. Reasoning: low',
          timeoutMs: 40000,
        },
      );
    }
    return LLMServiceFactory.instance;
  };
}
