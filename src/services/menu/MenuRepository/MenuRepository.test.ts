import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TDatabaseConnection } from '@/services/database/types';

import { CityValidator } from '@/utils/CityValidator';

import { MenuRepository } from './MenuRepository';

// Mock dependencies
vi.mock('@/services/EmbeddingService/EmbeddingService');
vi.mock('@/utils/CityValidator');

describe('MenuRepository', () => {
  let menuRepository: MenuRepository;
  let mockDb: TDatabaseConnection;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
      get: vi.fn(),
      run: vi.fn(),
      close: vi.fn(),
    };

    menuRepository = new MenuRepository(mockDb);
  });

  describe('searchByEmbedding with city filter', () => {
    it('should filter results by city when city parameter is provided', async () => {
      // Mock CityValidator
      const mockCityCoords = { latitude: 58.010454, longitude: 56.229441 };
      vi.mocked(CityValidator.getCityCoordinates).mockReturnValue(mockCityCoords);

      // Mock database response
      const mockResults = [
        {
          id: '1',
          name: 'Бургер',
          description: 'Вкусный бургер',
          price: 500,
          restaurant_id: 'rest1',
          restaurant_name: 'Ресторан 1',
          restaurant_latitude: 58.010454,
          restaurant_longitude: 56.229441,
          available: true,
          order_url: 'http://example.com',
          category: 'burgers',
          image: 'burger.jpg',
          ingredients: ['булка', 'мясо'],
          similarity: 0.8,
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValue(mockResults);

      const queryEmbedding = [0.1, 0.2, 0.3];
      const options = {
        city: 'Пермь',
        deliveryRadiusKm: 50,
        limit: 10,
      };

      const result = await menuRepository.searchByEmbedding(queryEmbedding, options);

      // Verify CityValidator was called
      expect(CityValidator.getCityCoordinates).toHaveBeenCalledWith('Пермь');

      // Verify SQL query includes distance calculation
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('6371 * acos'),
        expect.arrayContaining([
          '[0.1,0.2,0.3]',
          0.3, // minSimilarity
          mockCityCoords.latitude,
          mockCityCoords.longitude,
          50, // deliveryRadiusKm
          10, // limit
        ]),
      );

      expect(result).toHaveLength(1);
      expect(result[0].restaurant.coordinates).toEqual({
        latitude: 58.010454,
        longitude: 56.229441,
      });
    });

    it('should not filter by city when city parameter is not provided', async () => {
      const mockResults = [
        {
          id: '1',
          name: 'Бургер',
          description: 'Вкусный бургер',
          price: 500,
          restaurant_id: 'rest1',
          restaurant_name: 'Ресторан 1',
          restaurant_latitude: 58.010454,
          restaurant_longitude: 56.229441,
          available: true,
          order_url: 'http://example.com',
          category: 'burgers',
          image: 'burger.jpg',
          ingredients: ['булка', 'мясо'],
          similarity: 0.8,
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValue(mockResults);

      const queryEmbedding = [0.1, 0.2, 0.3];
      const options = {
        limit: 10,
      };

      await menuRepository.searchByEmbedding(queryEmbedding, options);

      // Verify CityValidator was not called
      expect(CityValidator.getCityCoordinates).not.toHaveBeenCalled();

      // Verify SQL query does not include distance calculation
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.not.stringContaining('6371 * acos'),
        expect.arrayContaining([
          '[0.1,0.2,0.3]',
          0.3, // minSimilarity
          10, // limit
        ]),
      );
    });

    it('should handle case when city coordinates are not found', async () => {
      // Mock CityValidator to return null
      vi.mocked(CityValidator.getCityCoordinates).mockReturnValue(null);

      const mockResults = [
        {
          id: '1',
          name: 'Бургер',
          description: 'Вкусный бургер',
          price: 500,
          restaurant_id: 'rest1',
          restaurant_name: 'Ресторан 1',
          restaurant_latitude: 58.010454,
          restaurant_longitude: 56.229441,
          available: true,
          order_url: 'http://example.com',
          category: 'burgers',
          image: 'burger.jpg',
          ingredients: ['булка', 'мясо'],
          similarity: 0.8,
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValue(mockResults);

      const queryEmbedding = [0.1, 0.2, 0.3];
      const options = {
        city: 'Неизвестный город',
        limit: 10,
      };

      await menuRepository.searchByEmbedding(queryEmbedding, options);

      // Verify CityValidator was called
      expect(CityValidator.getCityCoordinates).toHaveBeenCalledWith('Неизвестный город');

      // Verify SQL query does not include distance calculation (city filter is skipped)
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.not.stringContaining('6371 * acos'),
        expect.arrayContaining([
          '[0.1,0.2,0.3]',
          0.3, // minSimilarity
          10, // limit
        ]),
      );
    });
  });
});
