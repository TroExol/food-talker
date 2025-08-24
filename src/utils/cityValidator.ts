import type { TCoordinates } from '@/types/restaurant';
import type { EAvailableCities } from '@/config/bot/types';

import { botConfig } from '@/config/bot';

/**
 * Специализированная валидация городов и координат
 */

export class CityValidator {
  private static readonly cityCoordinates: Record<EAvailableCities, TCoordinates> = {
    Пермь: { latitude: 58.010454, longitude: 56.229441 },
    Воронеж: { latitude: 51.661535, longitude: 39.200287 },
  };

  public static isSupported(city: EAvailableCities): boolean {
    const normalized = this.normalizeCityName(city);
    return botConfig.availableCities.includes(normalized);
  }

  public static getCityCoordinates(city: EAvailableCities): TCoordinates | null {
    const normalized = this.normalizeCityName(city);
    return this.cityCoordinates[normalized] || null;
  }

  public static normalizeCityName(city: EAvailableCities): EAvailableCities {
    const normalized = city
      .trim()
      .replace(/\s+/g, ' ');

    // Capitalize first letter for Russian cities
    return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase() as EAvailableCities;
  }

  /**
   * Проверяет, находятся ли координаты в зоне доставки города
   */
  public static isInDeliveryZone(coordinates: TCoordinates, city: EAvailableCities, radiusKm = 50): boolean {
    const cityCoords = this.getCityCoordinates(city);
    if (!cityCoords) return false;

    const distance = this.calculateDistance(coordinates, cityCoords);
    return distance <= radiusKm;
  }

  private static calculateDistance(coord1: TCoordinates, coord2: TCoordinates): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(coord2.latitude - coord1.latitude);
    const dLon = this.toRadians(coord2.longitude - coord1.longitude);

    const a
      = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(this.toRadians(coord1.latitude))
      * Math.cos(this.toRadians(coord2.latitude))
      * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
