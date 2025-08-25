import { embeddingConfig, vectorSearchConfig } from '@/config/vectorSearch';

import { VectorSyncService } from './VectorSyncService';
import { VectorSearchService } from './VectorSearchService';
import { EmbeddingService } from './EmbeddingService';

// Создаем сервис векторного поиска с провайдером
export const vectorSearchService = new VectorSearchService(
  new EmbeddingService(embeddingConfig),
  vectorSearchConfig,
);

export const vectorSyncService = new VectorSyncService(vectorSearchService);
