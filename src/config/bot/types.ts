export enum EAvailableCities {
  KAZAN = 'Казань',
  // KRASNODAR = 'Краснодар',
  MOSCOW = 'Москва',
  // NIZHNY_NOVGOROD = 'Нижний Новгород',
  PERM = 'Пермь',
  // ST_PETERSBURG = 'Санкт-Петербург',
  // VORONEZH = 'Воронеж',
}

interface TUserSerchPromptSanitizerConfig {
  maxLength: number;
  minLength: number;
}

export interface TSanitizerConfig {
  userSearchPrompt: TUserSerchPromptSanitizerConfig;
}

export interface TCacheConfig {
  ttlMenu: number;
}

export interface TBotConfig {
  yandexEda: TYandexEdaConfig;
  availableCities: EAvailableCities[];
  sanitizer: TSanitizerConfig;
  fallbackFoodImage: string;
  cache: TCacheConfig;
  analyticsEnabled: boolean;
  lightRAGEnabled: boolean;
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
  proxyUrl?: string;
}
