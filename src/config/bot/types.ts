export enum EAvailableCities {
  MOSCOW = 'Москва',
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

export interface TCacheConfig {
  ttlMenu: number;
}

export interface TBotConfig {
  yandexEda: TYandexEdaConfig;
  availableCities: EAvailableCities[];
  sanitizer: TSanitizerConfig;
  fallbackFoodImage: string;
  cache: TCacheConfig;
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
