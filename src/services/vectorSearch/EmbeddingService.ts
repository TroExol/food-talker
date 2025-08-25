interface TEmbeddingConfig {
  baseUrl: string;
  apiKey?: string;
  modelName?: string;
}

interface TEmbeddingRequest {
  input: string;
  model?: string;
}

interface TEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export class EmbeddingService {
  private config: TEmbeddingConfig;

  constructor(config: TEmbeddingConfig) {
    this.config = {
      baseUrl: config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl,
      apiKey: config.apiKey,
      modelName: config.modelName,
    };
  }

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
        throw new Error(`LM Studio API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json() as TEmbeddingResponse;

      if (!result.data || result.data.length === 0) {
        throw new Error('LM Studio API returned empty embedding data');
      }

      return result.data[0].embedding;
    } catch (error) {
      throw new Error(`Ошибка генерации эмбеддинга через LM Studio: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
