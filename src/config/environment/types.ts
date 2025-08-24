export interface TEnvironment {
  NODE_ENV: 'development' | 'production';
  BOT_TOKEN: string;
  LLM_API_URL: string;
  LLM_API_KEY: string;
  DATABASE_URL: string;
  REDIS_URL?: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  WEBHOOK_URL?: string;
  WEBHOOK_SECRET?: string;
}
