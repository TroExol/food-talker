import { ESubscriptionType } from '@/models/user';
import { botConfig, type EAvailableCities } from '@/config/bot';

import { type Sanitizer, sanitizer as sanitizerInstance } from './sanitizer';

interface TValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedInput?: unknown;
}

export interface TValidator {
  // Input validation (from user)
  validateSearchQuery(query: string): TValidationResult;
  validateCity(city: string): TValidationResult;
  validateTelegramId(telegramId: number): TValidationResult;
  validateChatId(chatId: number): TValidationResult;
  validateSubscriptionType(subscription: string): TValidationResult;

  // Business logic validation (internal structures)
  validatePriceRange(min?: number, max?: number): TValidationResult;
  validateCoordinates(latitude: number, longitude: number): TValidationResult;
}

export class Validator implements TValidator {
  private readonly maxQueryLength = botConfig.sanitizer.maxLength;
  private readonly minQueryLength = botConfig.sanitizer.minLength;

  constructor(private readonly sanitizer: Sanitizer) {}

  validateSearchQuery(query: string): TValidationResult {
    const errors: string[] = [];

    if (!query || typeof query !== 'string') {
      errors.push('Запрос должен быть непустой строкой');
      return { isValid: false, errors };
    }

    const trimmedQuery = query.trim();

    if (trimmedQuery.length < this.minQueryLength) {
      errors.push('Запрос не может быть пустым');
    }

    const sanitizedQuery = this.sanitizer.sanitizeSearchQuery(trimmedQuery);

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedInput: sanitizedQuery,
    };
  }

  validateCity(city: string): TValidationResult {
    const errors: string[] = [];

    if (!city || typeof city !== 'string') {
      errors.push('Город должен быть непустой строкой');
      return { isValid: false, errors };
    }

    const normalizedCity = this.sanitizer.sanitizeCity(city);
    if (!botConfig.availableCities.includes(normalizedCity as EAvailableCities)) {
      errors.push(`Город должен быть одним из: ${botConfig.availableCities.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedInput: normalizedCity,
    };
  }

  validateTelegramId(telegramId: number): TValidationResult {
    const errors: string[] = [];

    if (typeof telegramId !== 'number' || !Number.isInteger(telegramId)) {
      errors.push('Telegram ID должен быть целым числом');
    }

    if (typeof telegramId === 'number' && telegramId <= 0) {
      errors.push('Telegram ID должен быть положительным числом');
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedInput: telegramId,
    };
  }

  validateChatId(chatId: number): TValidationResult {
    const errors: string[] = [];

    if (typeof chatId !== 'number' || !Number.isInteger(chatId) || chatId <= 0) {
      errors.push('Chat ID должен быть целым положительным числом');
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedInput: chatId,
    };
  }

  validateSubscriptionType(subscription: string): TValidationResult {
    const errors: string[] = [];
    const validSubscriptions: ESubscriptionType[] = Object.values(ESubscriptionType);

    if (typeof subscription !== 'string') {
      errors.push('Тип подписки должен быть строкой');
    }

    if (typeof subscription === 'string' && !validSubscriptions.includes(subscription as ESubscriptionType)) {
      errors.push(`Тип подписки должен быть одним из: ${validSubscriptions.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedInput: subscription,
    };
  }

  validatePriceRange(min?: number, max?: number): TValidationResult {
    const errors: string[] = [];

    if (min !== undefined) {
      if (typeof min !== 'number' || min < 0) {
        errors.push('Минимальная цена должна быть положительным числом');
      }
    }

    if (max !== undefined) {
      if (typeof max !== 'number' || max < 0) {
        errors.push('Максимальная цена должна быть положительным числом');
      }
    }

    if (min !== undefined && max !== undefined && min > max) {
      errors.push('Минимальная цена не может быть больше максимальной');
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedInput: { min, max },
    };
  }

  validateCoordinates(latitude: number, longitude: number): TValidationResult {
    const errors: string[] = [];

    if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
      errors.push('Широта должна быть числом от -90 до 90');
    }

    if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
      errors.push('Долгота должна быть числом от -180 до 180');
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedInput: { latitude, longitude },
    };
  }
}

export const validator = new Validator(sanitizerInstance);
