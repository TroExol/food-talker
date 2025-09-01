import { botConfig } from '@/config/bot';

export enum EErrorType {
  API_ERROR = 'API_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  CITY_NOT_SUPPORTED = 'CITY_NOT_SUPPORTED',
  DATA_COLLECTION_ERROR = 'DATA_COLLECTION_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EMBEDDING_ERROR = 'EMBEDDING_ERROR',
  LLM_ERROR = 'LLM_ERROR',
  MENU_ITEM_NOT_FOUND = 'MENU_ITEM_NOT_FOUND',
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

export class AppError extends Error {
  public readonly type: EErrorType;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isUserFacing: boolean;

  constructor(
    type: EErrorType,
    code: string,
    message: string,
    isUserFacing = false,
    details?: unknown,
  ) {
    super(message);
    this.type = type;
    this.code = code;
    this.details = details;
    this.isUserFacing = isUserFacing;
    this.name = 'AppError';
  }

  static validationError(message: string, details?: unknown): AppError {
    return new AppError(EErrorType.VALIDATION_ERROR, 'VALIDATION_FAILED', message, true, details);
  }

  static apiError(message: string, details?: unknown): AppError {
    return new AppError(EErrorType.API_ERROR, 'API_FAILED', message, false, details);
  }

  static networkError(message: string, details?: unknown): AppError {
    return new AppError(EErrorType.NETWORK_ERROR, 'NETWORK_FAILED', message, false, details);
  }

  static llmError(message: string, details?: unknown): AppError {
    return new AppError(EErrorType.LLM_ERROR, 'LLM_FAILED', message, false, details);
  }

  static databaseError(message: string, details?: unknown): AppError {
    return new AppError(EErrorType.DATABASE_ERROR, 'DATABASE_FAILED', message, false, details);
  }

  static rateLimitError(message: string, details?: unknown): AppError {
    return new AppError(EErrorType.RATE_LIMIT_ERROR, 'RATE_LIMIT_EXCEEDED', message, true, details);
  }

  static systemError(message: string, details?: unknown): AppError {
    return new AppError(EErrorType.SYSTEM_ERROR, 'SYSTEM_FAILED', message, false, details);
  }

  static userNotFound(telegramId: string): AppError {
    return new AppError(
      EErrorType.USER_NOT_FOUND,
      'USER_NOT_FOUND',
      'Пользователь не найден',
      true,
      { telegramId },
    );
  }

  static cityNotSupported(city: string): AppError {
    return new AppError(
      EErrorType.CITY_NOT_SUPPORTED,
      'CITY_NOT_SUPPORTED',
      `Город "${city}" пока не поддерживается. Доступные города: ${botConfig.availableCities.join(', ')}`,
      true,
      { city },
    );
  }

  static cacheError(message: string, details?: unknown): AppError {
    return new AppError(EErrorType.CACHE_ERROR, 'CACHE_FAILED', message, false, details);
  }

  static dataCollectionError(message: string, details?: unknown): AppError {
    return new AppError(EErrorType.DATA_COLLECTION_ERROR, 'DATA_COLLECTION_FAILED', message, false, details);
  }

  static embeddingError(message: string, details?: unknown): AppError {
    return new AppError(EErrorType.EMBEDDING_ERROR, 'EMBEDDING_FAILED', message, false, details);
  }

  static menuItemNotFound(menuItemId: string): AppError {
    return new AppError(EErrorType.MENU_ITEM_NOT_FOUND, 'MENU_ITEM_NOT_FOUND', 'Блюдо не найдено', true, { menuItemId });
  }
}
