import { environment } from './environment';

export enum EAvailableCities {
  PERM = 'Пермь',
  VORONEZH = 'Воронеж',
}

export interface TBotConfig {
  telegramToken: string;
  llmApiUrl: string;
  llmApiKey: string;
  database: TDatabaseConfig;
  cache: TCacheConfig;
  yandexEda: TYandexEdaConfig;
  availableCities: EAvailableCities[];
}

export interface TDatabaseConfig {
  url: string;
  maxConnections: number;
  timeout: number;
}

export interface TCacheConfig {
  ttl: number;
  maxSize: number;
  type: 'memory' | 'redis';
  redisUrl?: string;
}

export interface TYandexEdaConfig {
  baseUrl: string;
  headers: Record<string, string>;
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
}

export const botConfig: TBotConfig = {
  telegramToken: environment.BOT_TOKEN,
  llmApiUrl: environment.LLM_API_URL,
  llmApiKey: environment.LLM_API_KEY,
  database: {
    url: environment.DATABASE_URL,
    maxConnections: 10,
    timeout: 5000,
  },
  cache: {
    ttl: 3600, // 1 hour
    maxSize: 1000,
    type: environment.REDIS_URL ? 'redis' : 'memory',
    redisUrl: environment.REDIS_URL,
  },
  availableCities: [EAvailableCities.PERM, EAvailableCities.VORONEZH],
  yandexEda: {
    baseUrl: 'https://eda.yandex.ru',
    headers: {
      'Content-Type': 'application/json',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'x-app-version': '17.52.4',
      'x-platform': 'desktop_web',
      'x-client-session': 'mei8lrkd-d49t83iglm-2sset7rzpp6-8qnt1cacvd',
      'x-device-id': 'mei8lrkd-fnbl951fo7-vqvkmfvgb8f-cgrtjueuxx8',
      'x-taxi': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 platform=eats_desktop_web',
    },
    rateLimits: {
      requestsPerMinute: 100,
      requestsPerHour: 1000,
    },
  },
};
