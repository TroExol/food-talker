export interface TEmbeddingConfig {
  baseUrl: string;
  apiKey?: string;
  modelName?: string;
}

export interface TEmbeddingRequest {
  input: string | string[];
  model?: string;
}

export interface TEmbeddingResponse {
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
