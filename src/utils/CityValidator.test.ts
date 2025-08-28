import {
  describe,
  expect,
  it,
} from 'vitest';

import type { EAvailableCities } from '@/config/bot/types';

import { CityValidator } from './CityValidator';

describe('CityValidator', () => {
  describe('normalizeCityName', () => {
    it('должен корректно нормализовать "санкт-петербург"', () => {
      const result = CityValidator.normalizeCityName('санкт-петербург' as EAvailableCities);
      expect(result).toBe('Санкт-Петербург');
    });

    it('должен корректно нормализовать "САНКТ-ПЕТЕРБУРГ"', () => {
      const result = CityValidator.normalizeCityName('САНКТ-ПЕТЕРБУРГ' as EAvailableCities);
      expect(result).toBe('Санкт-Петербург');
    });

    it('должен корректно нормализовать "санкт петербург"', () => {
      const result = CityValidator.normalizeCityName('санкт петербург' as EAvailableCities);
      expect(result).toBe('Санкт Петербург');
    });

    it('должен корректно нормализовать "нижний новгород"', () => {
      const result = CityValidator.normalizeCityName('нижний новгород' as EAvailableCities);
      expect(result).toBe('Нижний Новгород');
    });

    it('должен корректно нормализовать "НИЖНИЙ НОВГОРОД"', () => {
      const result = CityValidator.normalizeCityName('НИЖНИЙ НОВГОРОД' as EAvailableCities);
      expect(result).toBe('Нижний Новгород');
    });

    it('должен корректно нормализовать "москва"', () => {
      const result = CityValidator.normalizeCityName('москва' as EAvailableCities);
      expect(result).toBe('Москва');
    });

    it('должен корректно нормализовать "пермь"', () => {
      const result = CityValidator.normalizeCityName('пермь' as EAvailableCities);
      expect(result).toBe('Пермь');
    });

    it('должен корректно нормализовать "краснодар"', () => {
      const result = CityValidator.normalizeCityName('краснодар' as EAvailableCities);
      expect(result).toBe('Краснодар');
    });

    it('должен корректно нормализовать "казань"', () => {
      const result = CityValidator.normalizeCityName('казань' as EAvailableCities);
      expect(result).toBe('Казань');
    });

    it('должен убирать лишние пробелы', () => {
      const result = CityValidator.normalizeCityName('  москва  ' as EAvailableCities);
      expect(result).toBe('Москва');
    });

    it('должен убирать множественные пробелы', () => {
      const result = CityValidator.normalizeCityName('нижний   новгород' as EAvailableCities);
      expect(result).toBe('Нижний Новгород');
    });
  });
});
