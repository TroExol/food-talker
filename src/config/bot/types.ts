export enum EAvailableCities {
  PERM = 'Пермь',
  VORONEZH = 'Воронеж',
}

interface TUserSerchPromptSanitizerConfig {
  maxLength: number;
  minLength: number;
}

export interface TSanitizerConfig {
  userSearchPrompt: TUserSerchPromptSanitizerConfig;
}

export interface TBotConfig {
  telegramToken: string;
  llmApiUrl: string;
  llmApiKey: string;
  database: TDatabaseConfig;
  cache: TCacheConfig;
  yandexEda: TYandexEdaConfig;
  availableCities: EAvailableCities[];
  sanitizer: TSanitizerConfig;
  fallbackFoodImage: string;
}

export interface TDatabaseConfig {
  url: string;
  maxConnections: number;
  timeout: number;
}

export interface TCacheConfig {
  ttl: number;
  maxSize: number;
  redisUrl?: string;
}

export interface TYandexEdaConfig {
  baseUrl: string;
  headers: Record<string, string>;
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
  delayBetweenRequestsMs: number;
  retries: number;
}
