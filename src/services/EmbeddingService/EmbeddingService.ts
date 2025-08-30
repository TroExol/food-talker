import type { NeuralRequestLoggingService } from '@/services/NeuralRequestLoggingService/NeuralRequestLoggingService';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';
import { ENeuralRequestType } from '@/types/neuralRequestLogging';

import type {
  TEmbeddingConfig,
  TEmbeddingRequest,
  TEmbeddingResponse,
} from './types';

export class EmbeddingService {
  private readonly batchSize = 10; // Размер батча для embedding запросов
  private readonly maxConcurrentBatches = 3; // Максимум параллельных батчей

  constructor(
    private readonly neuralRequestLoggingService: NeuralRequestLoggingService,
    private readonly config: TEmbeddingConfig,
  ) { }

  public generateEmbedding = async (text: string, userTelegramId?: number): Promise<number[]> => {
    const startTime = Date.now();

    try {
      const requestBody: TEmbeddingRequest = {
        input: text,
      };

      if (this.config.modelName) {
        requestBody.model = this.config.modelName;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(`${this.config.baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw AppError.embeddingError(`API error`, {
          status: response.status,
          statusText: response.statusText,
          response: await response.text(),
        });
      }

      const result = await response.json() as TEmbeddingResponse;

      // Логируем успешный запрос
      const processingTime = Date.now() - startTime;

      if (!result.data || result.data.length === 0) {
        await this.neuralRequestLoggingService.logRequest({
          userTelegramId,
          requestType: ENeuralRequestType.EMBEDDING,
          model: result.model,
          inputTokens: result.usage.prompt_tokens,
          outputTokens: 0, // Для embedding нет output токенов
          totalTokens: result.usage.total_tokens,
          requestData: {
            input: text,
            model: this.config.modelName,
          },
          responseData: {
            error: 'API вернул пустой embedding',
          },
          processingTimeMs: processingTime,
        });

        throw AppError.embeddingError('API вернул пустой embedding', { result });
      }

      await this.neuralRequestLoggingService.logRequest({
        userTelegramId,
        requestType: ENeuralRequestType.EMBEDDING,
        model: result.model,
        inputTokens: result.usage.prompt_tokens,
        outputTokens: 0, // Для embedding нет output токенов
        totalTokens: result.usage.total_tokens,
        requestData: {
          input: text,
          model: this.config.modelName,
        },
        responseData: undefined, // Не сохраняем результат embedding
        processingTimeMs: processingTime,
      });

      return result.data[0].embedding;
    } catch (error) {
      // Логируем неудачный запрос
      const processingTime = Date.now() - startTime;

      await this.neuralRequestLoggingService.logRequest({
        userTelegramId,
        requestType: ENeuralRequestType.EMBEDDING,
        model: this.config.modelName || 'unknown',
        inputTokens: 0, // Не можем определить без успешного ответа
        outputTokens: 0,
        totalTokens: 0,
        requestData: {
          input: text,
          model: this.config.modelName,
        },
        responseData: {
          error: error instanceof Error ? error.message : String(error),
        },
        processingTimeMs: processingTime,
      });

      throw AppError.embeddingError('Ошибка генерации эмбеддинга', error as Error);
    }
  };

  // Батчинг для множественных embedding запросов
  public generateEmbeddingsBatch = async (
    texts: string[],
    userTelegramId?: number,
  ): Promise<number[][]> => {
    if (texts.length === 0) return [];

    const startTime = Date.now();
    const results: number[][] = [];

    try {
      // Разбиваем на батчи
      const batches = this.chunkArray(texts, this.batchSize);
      const batchBatches = this.chunkArray(batches, this.maxConcurrentBatches);

      for (const batchBatch of batchBatches) {
        const batchPromises = batchBatch.map(batch => this.processEmbeddingBatch(batch, userTelegramId));
        const batchResults = await Promise.all(batchPromises);

        // Объединяем результаты
        for (const batchResult of batchResults) {
          results.push(...batchResult);
        }
      }

      const totalTime = Date.now() - startTime;
      ConsoleLogger.debug(`Generated ${texts.length} embeddings in ${totalTime}ms (${Math.round(texts.length / totalTime * 1000)}/sec)`);

      return results;
    } catch (error) {
      throw AppError.embeddingError('Ошибка батч генерации эмбеддингов', error as Error);
    }
  };

  private processEmbeddingBatch = async (
    texts: string[],
    userTelegramId?: number,
  ): Promise<number[][]> => {
    const startTime = Date.now();

    try {
      const requestBody: TEmbeddingRequest = {
        input: texts,
      };

      if (this.config.modelName) {
        requestBody.model = this.config.modelName;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(`${this.config.baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw AppError.embeddingError(`Batch API error`, {
          status: response.status,
          statusText: response.statusText,
          response: await response.text(),
        });
      }

      const result = await response.json() as TEmbeddingResponse;
      const processingTime = Date.now() - startTime;

      if (!result.data || result.data.length === 0) {
        throw AppError.embeddingError('API вернул пустой batch embedding', { result });
      }

      // Логируем батч запрос
      await this.neuralRequestLoggingService.logRequest({
        userTelegramId,
        requestType: ENeuralRequestType.EMBEDDING,
        model: result.model,
        inputTokens: result.usage.prompt_tokens,
        outputTokens: 0,
        totalTokens: result.usage.total_tokens,
        requestData: {
          batchSize: texts.length,
          model: this.config.modelName,
        },
        responseData: undefined,
        processingTimeMs: processingTime,
      });

      return result.data.map(item => item.embedding);
    } catch (error) {
      const processingTime = Date.now() - startTime;

      await this.neuralRequestLoggingService.logRequest({
        userTelegramId,
        requestType: ENeuralRequestType.EMBEDDING,
        model: this.config.modelName || 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        requestData: {
          batchSize: texts.length,
          model: this.config.modelName,
        },
        responseData: {
          error: error instanceof Error ? error.message : String(error),
        },
        processingTimeMs: processingTime,
      });

      throw error;
    }
  };

  // Вспомогательный метод для разбиения массива на батчи
  private chunkArray = <T>(array: T[], chunkSize: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  };
}
