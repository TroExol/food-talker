export interface TEnvironment {
  NODE_ENV: 'development' | 'production';
  BOT_TOKEN: string;
  LLM_API_URL: string;
  LLM_API_KEY: string;
  REDIS_URL?: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  WEBHOOK_URL?: string;
  WEBHOOK_SECRET?: string;
  DB_HOST: string;
  DB_PORT: string;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_MAX_CONNECTIONS: string;
  EMBEDDING_API_BASE_URL: string;
  EMBEDDING_API_KEY: string;
  EMBEDDING_MODEL_NAME: string;
  ADMIN_TELEGRAM_ID?: string;
  PROXY_URL?: string;
}
