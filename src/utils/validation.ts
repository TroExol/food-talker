import { botConfig, type EAvailableCities } from '@/config/bot';

export interface TValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedInput?: unknown;
}

export interface TValidator {
  validateSearchQuery(query: string): TValidationResult;
  validateCity(city: string): TValidationResult;
}

export class Validator implements TValidator {
  private readonly maxQueryLength = 500;

  validateSearchQuery(query: string): TValidationResult {
    const errors: string[] = [];

    if (!query || typeof query !== 'string') {
      errors.push('Query must be a non-empty string');
    }

    if (query.length > this.maxQueryLength) {
      errors.push(`Query must be less than ${this.maxQueryLength} characters`);
    }

    if (query.trim().length === 0) {
      errors.push('Query cannot be empty or contain only whitespace');
    }

    const sanitizedQuery = query.trim().slice(0, this.maxQueryLength);

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedInput: sanitizedQuery,
    };
  }

  validateCity(city: string): TValidationResult {
    const errors: string[] = [];

    if (!city || typeof city !== 'string') {
      errors.push('City must be a non-empty string');
    }

    const normalizedCity = city.trim() as EAvailableCities;
    if (!botConfig.availableCities.includes(normalizedCity)) {
      errors.push(`City must be one of: ${botConfig.availableCities.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedInput: normalizedCity,
    };
  }
}

export const validator = new Validator();
