import { botConfig } from '@/config/bot';

export enum TErrorType {
  API_ERROR = 'API_ERROR',
  CITY_NOT_SUPPORTED = 'CITY_NOT_SUPPORTED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  LLM_ERROR = 'LLM_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

export interface TAppError extends Error {
  type: TErrorType;
  code: string;
  details?: unknown;
  isUserFacing: boolean;
}

export class AppError extends Error implements TAppError {
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
}
