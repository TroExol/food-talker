import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';

export interface LightRAGConfig {
  baseUrl: string;
  apiKey?: string;
}

export interface LightRAGQueryOptions {
  mode?: 'hybrid' | 'naive' | 'local' | 'global' | 'mix';
  enableRerank?: boolean;
  topK?: number;
  ids?: string[];
}

export interface LightRAGQueryResult {
  answer: string;
  context?: string[];
  sources?: string[];
  metadata?: Record<string, unknown>[];
}

export class LightRAGService {
  constructor(private readonly config: LightRAGConfig) { }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    try {
      const url = `${this.config.baseUrl}${endpoint}`;
      const headers: { 'X-API-Key'?: string } & RequestInit['headers'] = {
        'Content-Type': 'application/json',
        ...options.headers,
      };

      if (this.config.apiKey) {
        headers['X-API-Key'] = this.config.apiKey;
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        throw AppError.systemError(
          'LIGHTRAG_REQUEST_FAILED',
          `LightRAG request failed: ${response.status} ${response.statusText}`,
        );
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('LightRAG request error', error as Error);
      throw AppError.systemError('LIGHTRAG_REQUEST_FAILED', 'LightRAG request failed');
    }
  }

  public async query(
    query: string,
    options: LightRAGQueryOptions = {},
  ): Promise<LightRAGQueryResult> {
    const { mode = 'mix', enableRerank = true, topK = 40, ids } = options;

    const result = await this.makeRequest<LightRAGQueryResult>('/query', {
      method: 'POST',
      body: JSON.stringify({
        query,
        mode,
        enable_rerank: enableRerank,
        top_k: topK,
        ids,
      }),
    });

    return result;
  }

  public async insertText(
    text: string,
    description?: string,
    id?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.makeRequest('/documents/text', {
      method: 'POST',
      body: JSON.stringify({
        text,
        description,
        id,
        metadata,
      }),
    });
  }

  public async insertTexts(
    texts: string[],
    descriptions?: string[],
    ids?: string[],
    metadataArray?: Record<string, unknown>[],
  ): Promise<void> {
    await this.makeRequest('/documents/texts', {
      method: 'POST',
      body: JSON.stringify({
        texts,
        descriptions,
        ids,
        metadatas: metadataArray,
      }),
    });
  }
}
