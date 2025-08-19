/**
 * Утилиты для очистки и нормализации пользовательских данных
 */

import { botConfig } from '@/config/bot';

export interface TSanitizer {
  sanitizeSearchQuery(query: string): string;
  sanitizeCity(city: string): string;
  sanitizeRestaurantName(name: string): string;
  removeHarmfulContent(input: string): string;
  normalizeWhitespace(input: string): string;
}

export class Sanitizer implements TSanitizer {
  private readonly maxLength = botConfig.sanitizer.maxLength;

  sanitizeSearchQuery(query: string): string {
    return this.removeHarmfulContent(
      this.normalizeWhitespace(query.trim()),
    ).slice(0, this.maxLength);
  }

  sanitizeCity(city: string): string {
    const normalized = this.normalizeWhitespace(city.trim());

    // Capitalize first letter of each word for Russian cities
    return normalized
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  sanitizeRestaurantName(name: string): string {
    return this.removeHarmfulContent(
      this.normalizeWhitespace(name.trim()),
    );
  }

  removeHarmfulContent(input: string): string {
    return input
      // Remove HTML tags
      .replace(/<[^>]*>/g, '')
      // Remove script-related content
      .replace(/javascript:/gi, '')
      // Remove event handlers
      .replace(/on\w+\s*=/gi, '')
      // Remove template literals
      .replace(/\{\{.*?\}\}/g, '')
      // Remove potentially dangerous characters
      .replace(/[<>]/g, '');
  }

  normalizeWhitespace(input: string): string {
    return input
      // Replace multiple spaces with single space
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .replace(/\r+/g, '\r')
      // Remove leading/trailing whitespace
      .trim();
  }
}

export const sanitizer = new Sanitizer();
