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

export const environment: TEnvironment = {
  NODE_ENV: (process.env.NODE_ENV as 'development' | 'production') || 'development',
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  LLM_API_URL: process.env.LLM_API_URL || '',
  LLM_API_KEY: process.env.LLM_API_KEY || '',
  DATABASE_URL: process.env.DATABASE_URL || './data/bot.db',
  REDIS_URL: process.env.REDIS_URL,
  LOG_LEVEL: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
  WEBHOOK_URL: process.env.WEBHOOK_URL,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
};

export const validateEnvironment = (): void => {
  const required = ['BOT_TOKEN', 'LLM_API_URL', 'LLM_API_KEY'];
  const missing = required.filter(key => !environment[key as keyof TEnvironment]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};
