import type { EAvailableCities } from '@/config/bot/types';

import { ESubscriptionType } from '@/services/user/UserRepository/types';
import { botConfig } from '@/config/bot';

import { Sanitizer } from './Sanitizer';

interface TValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedInput?: unknown;
}

export class Validator {
  public static validateSearchQuery(query: string): TValidationResult {
    const errors: string[] = [];

    if (!query || typeof query !== 'string') {
      errors.push('Запрос должен быть непустой строкой');
      return { isValid: false, errors };
    }

    const trimmedQuery = query.trim();

    if (trimmedQuery.length < botConfig.sanitizer.userSearchPrompt.minLength) {
      errors.push('Запрос не может быть пустым');
    }

    const sanitizedQuery = Sanitizer.sanitizeSearchQuery(trimmedQuery);

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedInput: sanitizedQuery,
    };
  }

  public static validateCity(city: string): TValidationResult {
    const errors: string[] = [];

    if (!city || typeof city !== 'string') {
      errors.push('Город должен быть непустой строкой');
      return { isValid: false, errors };
    }

    const normalizedCity = Sanitizer.sanitizeCity(city);
    if (!botConfig.availableCities.includes(normalizedCity as EAvailableCities)) {
      errors.push(`Город должен быть одним из: ${botConfig.availableCities.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedInput: normalizedCity,
    };
  }

  public static validateTelegramId(telegramId: number): TValidationResult {
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

  public static validateChatId(chatId: number): TValidationResult {
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

  public static validateSubscriptionType(subscription: string): TValidationResult {
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

  public static validatePriceRange(min?: number, max?: number): TValidationResult {
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

  public static validateCoordinates(latitude: number, longitude: number): TValidationResult {
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
