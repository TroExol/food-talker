import OpenAI from 'openai';

import type { NeuralRequestLoggingService } from '@/services/NeuralRequestLoggingService/NeuralRequestLoggingService';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';
import { ENeuralRequestType } from '@/types/neuralRequestLogging';
import { environment } from '@/config/environment';

import type {
  TEmbeddingConfig,
  TEmbeddingRequest,
  TEmbeddingResponse,
} from './types';

export class EmbeddingService {
  private readonly batchSize = 10; // Размер батча для embedding запросов
  private readonly maxConcurrentBatches = 3; // Максимум параллельных батчей
  private readonly openai = new OpenAI({
    apiKey: environment.OPENAI_API_KEY,
  });

  constructor(
    private readonly neuralRequestLoggingService: NeuralRequestLoggingService,
    private readonly config: TEmbeddingConfig,
  ) { }

  public generateEmbedding = async (
    text: string,
    userTelegramId?: number,
    model = 'text-embedding-bge-m3',
  ): Promise<number[]> => {
    const startTime = Date.now();

    try {
      const requestBody: TEmbeddingRequest = {
        model,
        input: text,
      };

      const result = await this.makeLMStudioRequest(requestBody);

      // Логируем успешный запрос
      const processingTime = Date.now() - startTime;

      if (!result.data || result.data.length === 0) {
        void this.neuralRequestLoggingService.logRequest({
          userTelegramId,
          requestType: ENeuralRequestType.EMBEDDING,
          model: result.model,
          inputTokens: result.usage.prompt_tokens,
          outputTokens: 0, // Для embedding нет output токенов
          totalTokens: result.usage.total_tokens,
          requestData: {
            input: text,
            model,
          },
          responseData: {
            error: 'API вернул пустой embedding',
          },
          processingTimeMs: processingTime,
        }).catch(logError => {
          ConsoleLogger.error('Ошибка логирования запроса', logError as Error);
        });

        throw AppError.embeddingError('API вернул пустой embedding', { result });
      }

      void this.neuralRequestLoggingService.logRequest({
        userTelegramId,
        requestType: ENeuralRequestType.EMBEDDING,
        model: result.model,
        inputTokens: result.usage.prompt_tokens,
        outputTokens: 0, // Для embedding нет output токенов
        totalTokens: result.usage.total_tokens,
        requestData: {
          input: text,
          model,
        },
        responseData: undefined, // Не сохраняем результат embedding
        processingTimeMs: processingTime,
      }).catch(error => {
        ConsoleLogger.error('Ошибка логирования запроса', error as Error);
      });

      return result.data[0].embedding;
    } catch (error) {
      // Логируем неудачный запрос
      const processingTime = Date.now() - startTime;

      void this.neuralRequestLoggingService.logRequest({
        userTelegramId,
        requestType: ENeuralRequestType.EMBEDDING,
        model: model || 'unknown',
        inputTokens: 0, // Не можем определить без успешного ответа
        outputTokens: 0,
        totalTokens: 0,
        requestData: {
          input: text,
          model,
        },
        responseData: {
          error: error instanceof Error ? error.message : String(error),
        },
        processingTimeMs: processingTime,
      }).catch(logError => {
        ConsoleLogger.error('Ошибка логирования запроса', logError as Error);
      });

      throw AppError.embeddingError('Ошибка генерации эмбеддинга', error as Error);
    }
  };

  // Батчинг для множественных embedding запросов
  public generateEmbeddingsBatch = async (
    texts: string[],
    userTelegramId?: number,
    model = 'text-embedding-bge-m3',
  ): Promise<number[][]> => {
    if (texts.length === 0) return [];

    const startTime = Date.now();
    const results: number[][] = [];

    try {
      // Разбиваем на батчи
      const batches = this.chunkArray(texts, this.batchSize);
      const batchBatches = this.chunkArray(batches, this.maxConcurrentBatches);

      for (const batchBatch of batchBatches) {
        const batchPromises = batchBatch.map(batch => this.processEmbeddingBatch(batch, userTelegramId, model));
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

  private makeLMStudioRequest = async (requestBody: TEmbeddingRequest): Promise<TEmbeddingResponse> => {
    try {
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

      return await response.json() as TEmbeddingResponse;
    } catch (error) {
      throw AppError.embeddingError('Ошибка генерации эмбеддинга', error as Error);
    }
  };

  public generateEmbeddingOpenAI = async (
    text: string,
    userTelegramId?: number,
    model = 'text-embedding-3-large',
  ): Promise<number[]> => {
    const startTime = Date.now();

    try {
      const result = await this.openai.embeddings.create({
        model,
        input: text,
        encoding_format: 'float',
      });

      const processingTime = Date.now() - startTime;

      void this.neuralRequestLoggingService.logRequest({
        userTelegramId,
        requestType: ENeuralRequestType.EMBEDDING,
        model: result.model,
        inputTokens: result.usage.prompt_tokens,
        outputTokens: 0, // Для embedding нет output токенов
        totalTokens: result.usage.total_tokens,
        requestData: {
          input: text,
          model,
        },
        responseData: undefined, // Не сохраняем результат embedding
        processingTimeMs: processingTime,
      }).catch(logError => {
        ConsoleLogger.error('Ошибка логирования запроса', logError as Error);
      });

      return result.data[0].embedding;
    } catch (error) {
      const processingTime = Date.now() - startTime;

      void this.neuralRequestLoggingService.logRequest({
        userTelegramId,
        requestType: ENeuralRequestType.EMBEDDING,
        model: model || 'unknown',
        inputTokens: 0, // Не можем определить без успешного ответа
        outputTokens: 0,
        totalTokens: 0,
        requestData: {
          input: text,
          model,
        },
        responseData: {
          error: error instanceof Error ? error.message : String(error),
        },
        processingTimeMs: processingTime,
      }).catch(logError => {
        ConsoleLogger.error('Ошибка логирования запроса', logError as Error);
      });

      throw AppError.embeddingError('Ошибка генерации эмбеддинга', error as Error);
    }
  };

  public generateEmbeddingsBatchOpenAI = async (
    texts: string[],
    userTelegramId?: number,
    model = 'text-embedding-3-large',
  ): Promise<number[][]> => {
    const startTime = Date.now();

    try {
      const result = await this.openai.embeddings.create({
        model,
        input: texts,
        encoding_format: 'float',
      });

      const processingTime = Date.now() - startTime;

      void this.neuralRequestLoggingService.logRequest({
        userTelegramId,
        requestType: ENeuralRequestType.EMBEDDING,
        model: result.model,
        inputTokens: result.usage.prompt_tokens,
        outputTokens: 0,
        totalTokens: result.usage.total_tokens,
        requestData: {
          batchSize: texts.length,
          model,
        },
        responseData: undefined,
        processingTimeMs: processingTime,
      }).catch(logError => {
        ConsoleLogger.error('Ошибка логирования запроса', logError as Error);
      });

      return result.data.map(item => item.embedding);
    } catch (error) {
      const processingTime = Date.now() - startTime;

      void this.neuralRequestLoggingService.logRequest({
        userTelegramId,
        requestType: ENeuralRequestType.EMBEDDING,
        model: model || 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        requestData: {
          batchSize: texts.length,
          model,
        },
        responseData: {
          error: error instanceof Error ? error.message : String(error),
        },
        processingTimeMs: processingTime,
      }).catch(logError => {
        ConsoleLogger.error('Ошибка логирования запроса', logError as Error);
      });

      throw AppError.embeddingError('Ошибка генерации эмбеддинга', error as Error);
    }
  };

  private processEmbeddingBatch = async (
    texts: string[],
    userTelegramId?: number,
    model = 'text-embedding-bge-m3',
  ): Promise<number[][]> => {
    const startTime = Date.now();

    try {
      const requestBody: TEmbeddingRequest = {
        input: texts,
        model,
      };

      const result = await this.makeLMStudioRequest(requestBody);

      const processingTime = Date.now() - startTime;

      if (!result.data || result.data.length === 0) {
        throw AppError.embeddingError('API вернул пустой batch embedding', { result });
      }

      // Логируем батч запрос
      void this.neuralRequestLoggingService.logRequest({
        userTelegramId,
        requestType: ENeuralRequestType.EMBEDDING,
        model: result.model,
        inputTokens: result.usage.prompt_tokens,
        outputTokens: 0,
        totalTokens: result.usage.total_tokens,
        requestData: {
          batchSize: texts.length,
          model,
        },
        responseData: undefined,
        processingTimeMs: processingTime,
      }).catch(logError => {
        ConsoleLogger.error('Ошибка логирования запроса', logError as Error);
      });

      return result.data.map(item => item.embedding);
    } catch (error) {
      const processingTime = Date.now() - startTime;

      void this.neuralRequestLoggingService.logRequest({
        userTelegramId,
        requestType: ENeuralRequestType.EMBEDDING,
        model: model || 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        requestData: {
          batchSize: texts.length,
          model,
        },
        responseData: {
          error: error instanceof Error ? error.message : String(error),
        },
        processingTimeMs: processingTime,
      }).catch(logError => {
        ConsoleLogger.error('Ошибка логирования запроса', logError as Error);
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
