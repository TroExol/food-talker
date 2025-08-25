export const vectorSearchConfig = {
  host: process.env.VECTOR_DB_HOST || 'localhost',
  port: parseInt(process.env.VECTOR_DB_PORT || '1235'),
  database: process.env.VECTOR_DB_NAME || '',
  user: process.env.VECTOR_DB_USER || '',
  password: process.env.VECTOR_DB_PASSWORD || '',
  maxConnections: parseInt(process.env.VECTOR_DB_MAX_CONNECTIONS || '10'),
};

export const embeddingConfig = {
  baseUrl: process.env.EMBEDDING_API_BASE_URL || '',
  apiKey: process.env.EMBEDDING_API_KEY || '',
  modelName: process.env.EMBEDDING_MODEL_NAME || '',
};
