import OpenAI from 'openai';

import type { NeuralRequestLoggingService } from '@/services/NeuralRequestLoggingService/NeuralRequestLoggingService';

import { sleep } from '@/utils/sleep';
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

  // OpenAI Embedding rate limits (in-memory)
  private static readonly OPENAI_EMB_TOKENS_PER_MIN = 1_000_000;
  private static readonly OPENAI_EMB_REQUESTS_PER_MIN = 3_000;
  private static readonly OPENAI_EMB_REQUESTS_PER_DAY: number | null = null;
  private static readonly MINUTE_MS = 60_000;
  private static readonly DAY_MS = 86_400_000;

  private readonly openAiEmbReqsMinute: number[] = [];
  private readonly openAiEmbReqsDay: number[] = [];
  private readonly openAiEmbTokensMinute: Array<{ timestamp: number; tokens: number }> = [];

  // Serialize OpenAI embedding requests
  private openAiEmbQueue: Promise<void> = Promise.resolve();

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
      // Enforce OpenAI embedding rate limits (serialized)
      const estimatedTokens = this.estimateEmbeddingTokens(text);
      const result = await this.enqueueOpenAiEmbedding(async () => {
        const reservationTs = await this.waitForOpenAiEmbeddingLimits(estimatedTokens);
        const request = await this.openai.embeddings.create({
          model,
          input: text,
          encoding_format: 'float',
        });
        this.finalizeOpenAiTokenReservation(reservationTs, request.usage.prompt_tokens);
        return request;
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
      // Enforce OpenAI embedding rate limits for batch (serialized)
      const estimatedTokens = this.estimateEmbeddingTokens(texts);
      const result = await this.enqueueOpenAiEmbedding(async () => {
        const reservationTs = await this.waitForOpenAiEmbeddingLimits(estimatedTokens);
        const request = await this.openai.embeddings.create({
          model,
          input: texts,
          encoding_format: 'float',
        });
        this.finalizeOpenAiTokenReservation(reservationTs, request.usage.prompt_tokens);
        return request;
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

  // ---- OpenAI embedding rate limiter helpers ----
  private enqueueOpenAiEmbedding = async <T>(task: () => Promise<T>): Promise<T> => {
    const previous = this.openAiEmbQueue;
    let resolveCurrent: () => void;
    this.openAiEmbQueue = new Promise<void>(resolve => {
      resolveCurrent = resolve;
    });
    try {
      await previous;
      const result = await task();
      resolveCurrent!();
      return result;
    } catch (e) {
      resolveCurrent!();
      throw e;
    }
  };

  private waitForOpenAiEmbeddingLimits = async (estimatedTokens: number): Promise<number> => {
    while (true) {
      const now = Date.now();
      this.cleanupOpenAiWindows(now);

      const reqsPerMinute = this.openAiEmbReqsMinute.length;
      const reqsPerDay = this.openAiEmbReqsDay.length;
      const tokensLastMinute = this.openAiEmbTokensMinute.reduce((sum, i) => sum + i.tokens, 0);

      const okRpm = reqsPerMinute + 1 <= EmbeddingService.OPENAI_EMB_REQUESTS_PER_MIN;
      const okRpd = EmbeddingService.OPENAI_EMB_REQUESTS_PER_DAY == null
        ? true
        : (reqsPerDay + 1 <= EmbeddingService.OPENAI_EMB_REQUESTS_PER_DAY);
      const okTpm = tokensLastMinute + Math.max(0, estimatedTokens) <= EmbeddingService.OPENAI_EMB_TOKENS_PER_MIN;

      if (okRpm && okRpd && okTpm) {
        // Reserve request slot timestamps now
        this.openAiEmbReqsMinute.push(now);
        if (EmbeddingService.OPENAI_EMB_REQUESTS_PER_DAY != null) {
          this.openAiEmbReqsDay.push(now);
        }
        // Reserve token budget provisionally
        this.openAiEmbTokensMinute.push({ timestamp: now, tokens: Math.max(0, estimatedTokens || 0) });
        return now;
      }

      let waitMs = 0;
      if (!okRpm && this.openAiEmbReqsMinute.length > 0) {
        const oldest = Math.min(...this.openAiEmbReqsMinute);
        waitMs = Math.max(waitMs, oldest + EmbeddingService.MINUTE_MS - now);
      }
      if (!okRpd && EmbeddingService.OPENAI_EMB_REQUESTS_PER_DAY != null && this.openAiEmbReqsDay.length > 0) {
        const oldest = Math.min(...this.openAiEmbReqsDay);
        waitMs = Math.max(waitMs, oldest + EmbeddingService.DAY_MS - now);
      }
      if (!okTpm && this.openAiEmbTokensMinute.length > 0) {
        const sorted = [...this.openAiEmbTokensMinute].sort((a, b) => a.timestamp - b.timestamp);
        const overBy = tokensLastMinute + Math.max(0, estimatedTokens) - EmbeddingService.OPENAI_EMB_TOKENS_PER_MIN;
        let cum = 0;
        let cutoffTs = sorted[0].timestamp;
        for (const item of sorted) {
          cum += item.tokens;
          if (cum > overBy) {
            cutoffTs = item.timestamp;
            break;
          }
        }
        waitMs = Math.max(waitMs, cutoffTs + EmbeddingService.MINUTE_MS - now);
      }

      await sleep(Math.max(25, waitMs));
    }
  };

  private finalizeOpenAiTokenReservation = (reservationTs: number, actualPromptTokens: number): void => {
    // Replace provisional estimate with actual usage
    const idx = this.openAiEmbTokensMinute.findIndex(i => i.timestamp === reservationTs);
    if (idx >= 0) {
      this.openAiEmbTokensMinute[idx] = { timestamp: reservationTs, tokens: Math.max(0, actualPromptTokens || 0) };
    } else {
      // Fallback: push actual if reservation missing
      this.openAiEmbTokensMinute.push({ timestamp: Date.now(), tokens: Math.max(0, actualPromptTokens || 0) });
    }
  };

  private cleanupOpenAiWindows = (now: number): void => {
    const minuteStart = now - EmbeddingService.MINUTE_MS;
    const dayStart = now - EmbeddingService.DAY_MS;

    for (let i = this.openAiEmbReqsMinute.length - 1; i >= 0; i--) {
      if (this.openAiEmbReqsMinute[i] <= minuteStart) this.openAiEmbReqsMinute.splice(i, 1);
    }
    if (EmbeddingService.OPENAI_EMB_REQUESTS_PER_DAY != null) {
      for (let i = this.openAiEmbReqsDay.length - 1; i >= 0; i--) {
        if (this.openAiEmbReqsDay[i] <= dayStart) this.openAiEmbReqsDay.splice(i, 1);
      }
    } else {
      // If day limit is disabled, keep array empty to avoid growth
      if (this.openAiEmbReqsDay.length) this.openAiEmbReqsDay.splice(0);
    }
    for (let i = this.openAiEmbTokensMinute.length - 1; i >= 0; i--) {
      if (this.openAiEmbTokensMinute[i].timestamp <= minuteStart) this.openAiEmbTokensMinute.splice(i, 1);
    }
  };

  private estimateEmbeddingTokens = (input: string | string[]): number => {
    const estimateFor = (s: string) => Math.ceil((s?.length ?? 0) / 4);
    return Array.isArray(input) ? input.reduce((sum, s) => sum + estimateFor(s), 0) : estimateFor(input);
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
