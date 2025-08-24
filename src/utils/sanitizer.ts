/**
 * Утилиты для очистки и нормализации пользовательских данных
 */

import { botConfig } from '@/config/bot';

export class Sanitizer {
  public static sanitizeSearchQuery(query: string): string {
    return this.removeHarmfulContent(
      this.normalizeWhitespace(query.trim()),
    ).slice(0, botConfig.sanitizer.userSearchPrompt.maxLength);
  }

  public static sanitizeCity(city: string): string {
    const normalized = this.normalizeWhitespace(city.trim());

    // Capitalize first letter of each word for Russian cities
    return normalized
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  public static sanitizeRestaurantName(name: string): string {
    return this.removeHarmfulContent(
      this.normalizeWhitespace(name.trim()),
    );
  }

  public static removeHarmfulContent(input: string): string {
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

  public static normalizeWhitespace(input: string): string {
    return input
      // Replace multiple spaces with single space
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .replace(/\r+/g, '\r')
      // Remove leading/trailing whitespace
      .trim();
  }
}
