import {
  afterEach,
  beforeEach,
  vi,
} from 'vitest';
import { vol } from 'memfs';

import type { TEnvironment } from '@/config/environment/types';

import { MOCKED_CURRENT_DATE } from './constants';

vi.mock('fs');
vi.mock('fs/promises');

vi.mock('@/config/environment', () => ({
  environment: {
    NODE_ENV: 'development',
    BOT_TOKEN: 'test-bot-token',
    WEBHOOK_URL: 'test-webhook-url',
    WEBHOOK_SECRET: 'test-webhook-secret',
    REDIS_URL: 'test-redis-url',
    LOG_LEVEL: 'info',
    DB_HOST: 'test-db-host',
    DB_PORT: 'test-db-port',
    DB_NAME: 'test-db-name',
    DB_USER: 'test-db-user',
    DB_PASSWORD: 'test-db-password',
    DB_MAX_CONNECTIONS: '10',
    LLM_API_URL: 'test-llm-api-url',
    LLM_API_KEY: 'test-llm-api-key',
    EMBEDDING_API_BASE_URL: 'test-embedding-api-base-url',
    EMBEDDING_API_KEY: 'test-embedding-api-key',
    EMBEDDING_MODEL_NAME: 'test-embedding-model-name',
    ADMIN_TELEGRAM_ID: '123456789',
  },
}) satisfies { environment: TEnvironment });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MOCKED_CURRENT_DATE);
});

afterEach(() => {
  // reset the state of in-memory fs
  vol.reset();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
