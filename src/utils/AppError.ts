import { botConfig } from '@/config/bot';

export enum TErrorType {
  API_ERROR = 'API_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  CITY_NOT_SUPPORTED = 'CITY_NOT_SUPPORTED',
  DATA_COLLECTION_ERROR = 'DATA_COLLECTION_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  LLM_ERROR = 'LLM_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

export class AppError extends Error {
  public readonly type: TErrorType;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isUserFacing: boolean;

  constructor(
    type: TErrorType,
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
    return new AppError(TErrorType.VALIDATION_ERROR, 'VALIDATION_FAILED', message, true, details);
  }

  static apiError(message: string, details?: unknown): AppError {
    return new AppError(TErrorType.API_ERROR, 'API_FAILED', message, false, details);
  }

  static networkError(message: string, details?: unknown): AppError {
    return new AppError(TErrorType.NETWORK_ERROR, 'NETWORK_FAILED', message, false, details);
  }

  static llmError(message: string, details?: unknown): AppError {
    return new AppError(TErrorType.LLM_ERROR, 'LLM_FAILED', message, false, details);
  }

  static databaseError(message: string, details?: unknown): AppError {
    return new AppError(TErrorType.DATABASE_ERROR, 'DATABASE_FAILED', message, false, details);
  }

  static rateLimitError(message: string, details?: unknown): AppError {
    return new AppError(TErrorType.RATE_LIMIT_ERROR, 'RATE_LIMIT_EXCEEDED', message, true, details);
  }

  static systemError(message: string, details?: unknown): AppError {
    return new AppError(TErrorType.SYSTEM_ERROR, 'SYSTEM_FAILED', message, false, details);
  }

  static userNotFound(telegramId: number): AppError {
    return new AppError(
      TErrorType.USER_NOT_FOUND,
      'USER_NOT_FOUND',
      'Пользователь не найден',
      true,
      { telegramId },
    );
  }

  static cityNotSupported(city: string): AppError {
    return new AppError(
      TErrorType.CITY_NOT_SUPPORTED,
      'CITY_NOT_SUPPORTED',
      `Город "${city}" пока не поддерживается. Доступные города: ${botConfig.availableCities.join(', ')}`,
      true,
      { city },
    );
  }

  static cacheError(message: string, details?: unknown): AppError {
    return new AppError(TErrorType.CACHE_ERROR, 'CACHE_FAILED', message, false, details);
  }

  static dataCollectionError(message: string, details?: unknown): AppError {
    return new AppError(TErrorType.DATA_COLLECTION_ERROR, 'DATA_COLLECTION_FAILED', message, false, details);
  }
}
