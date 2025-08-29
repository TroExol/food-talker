import type { TCoordinates } from '@/types/restaurant';
import type { EAvailableCities } from '@/config/bot/types';

import { botConfig } from '@/config/bot';

/**
 * Специализированная валидация городов и координат
 */

export class CityValidator {
  private static readonly cityCoordinates: Record<EAvailableCities, TCoordinates> = {
    Пермь: { latitude: 58.010454, longitude: 56.229441 },
    // 'Москва': { latitude: 55.755826, longitude: 37.617299 },
    // 'Краснодар': { latitude: 45.038189, longitude: 38.975913 },
    // 'Казань': { latitude: 55.796127, longitude: 49.106405 },
    // 'Санкт-Петербург': { latitude: 59.9386, longitude: 30.3141 },
  };

  public static isSupported = (city: EAvailableCities): boolean => {
    const normalized = this.normalizeCityName(city);
    return botConfig.availableCities.includes(normalized);
  };

  public static getCityCoordinates = (city: EAvailableCities): TCoordinates | null => {
    const normalized = this.normalizeCityName(city);
    return this.cityCoordinates[normalized] || null;
  };

  public static normalizeCityName = (city: EAvailableCities): EAvailableCities => {
    const normalized = city
      .trim()
      .replace(/\s+/g, ' ');

    // Capitalize first letter of each word for Russian cities
    // Сохраняем оригинальные разделители (пробелы или дефисы)
    const words = normalized.split(/([\s-])/); // Разделяем, но сохраняем разделители
    const result = words.map(part => {
      if (part.match(/[\s-]/)) {
        return part; // Возвращаем разделитель как есть
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    });

    return result.join('') as EAvailableCities;
  };

  /**
   * Проверяет, находятся ли координаты в зоне доставки города
   */
  public static isInDeliveryZone = (coordinates: TCoordinates, city: EAvailableCities, radiusKm = 50): boolean => {
    const cityCoords = this.getCityCoordinates(city);
    if (!cityCoords) return false;

    const distance = this.calculateDistance(coordinates, cityCoords);
    return distance <= radiusKm;
  };

  private static calculateDistance = (coord1: TCoordinates, coord2: TCoordinates): number => {
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
  };

  private static toRadians = (degrees: number): number => {
    return degrees * (Math.PI / 180);
  };
}
