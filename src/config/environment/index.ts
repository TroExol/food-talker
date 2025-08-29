import dotenv from 'dotenv';

import { AppError } from '@/utils/AppError';

import type { TEnvironment } from './types';

dotenv.config();

export const environment: TEnvironment = {
  NODE_ENV: (process.env.NODE_ENV as 'development' | 'production') || 'development',
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  WEBHOOK_URL: process.env.WEBHOOK_URL,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
  REDIS_URL: process.env.REDIS_URL,
  LOG_LEVEL: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
  DB_HOST: process.env.DB_HOST || '',
  DB_PORT: process.env.DB_PORT || '',
  DB_NAME: process.env.DB_NAME || '',
  DB_USER: process.env.DB_USER || '',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS || '10',
  LLM_API_BASE_URL: process.env.LLM_API_BASE_URL || '',
  LLM_API_KEY: process.env.LLM_API_KEY || '',
  EMBEDDING_API_BASE_URL: process.env.EMBEDDING_API_BASE_URL || '',
  EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY || '',
  EMBEDDING_MODEL_NAME: process.env.EMBEDDING_MODEL_NAME || '',
  ADMIN_TELEGRAM_ID: process.env.ADMIN_TELEGRAM_ID,
  PROXY_URL: process.env.PROXY_URL,
  YANDEX_METRIKA_COUNTER_ID: process.env.YANDEX_METRIKA_COUNTER_ID,
};

export const validateEnvironment = (): void => {
  const required = [
    'BOT_TOKEN',
    'LLM_API_BASE_URL',
    'LLM_API_KEY',
    'EMBEDDING_API_BASE_URL',
    'EMBEDDING_API_KEY',
    'EMBEDDING_MODEL_NAME',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
  ];
  const missing = required.filter(key => !environment[key as keyof TEnvironment]);

  if (missing.length > 0) {
    throw AppError.validationError('MISSING_ENV_VARIABLES', `Необходимые переменные окружения не установлены: ${missing.join(', ')}`);
  }
};
