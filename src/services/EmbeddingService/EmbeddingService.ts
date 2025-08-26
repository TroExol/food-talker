import { AppError } from '@/utils/AppError';

import type {
  TEmbeddingConfig,
  TEmbeddingRequest,
  TEmbeddingResponse,
} from './types';

export class EmbeddingService {
  constructor(
    private readonly config: TEmbeddingConfig,
  ) { }

  public generateEmbedding = async (text: string): Promise<number[]> => {
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

      if (!result.data || result.data.length === 0) {
        throw AppError.embeddingError('API вернул пустой embedding', { result });
      }

      return result.data[0].embedding;
    } catch (error) {
      throw AppError.embeddingError('Ошибка генерации эмбеддинга', error as Error);
    }
  };
}
