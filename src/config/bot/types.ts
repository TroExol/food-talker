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
  yandexEda: TYandexEdaConfig;
  availableCities: EAvailableCities[];
  sanitizer: TSanitizerConfig;
  fallbackFoodImage: string;
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
