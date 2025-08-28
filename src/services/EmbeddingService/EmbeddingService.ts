import type { NeuralRequestLoggingService } from '@/services/NeuralRequestLoggingService/NeuralRequestLoggingService';

import { AppError } from '@/utils/AppError';
import { ENeuralRequestType } from '@/types/neuralRequestLogging';

import type {
  TEmbeddingConfig,
  TEmbeddingRequest,
  TEmbeddingResponse,
} from './types';

export class EmbeddingService {
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
}
