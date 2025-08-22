import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import type { TSearchResult, TStructuredQuery } from '@/models/search';
import type { TYEMenuItem, TYERestaurant } from '@/models/yandexEda';

import { EAvailableCities } from '@/config/bot';

import { SearchFilterEngine } from './SearchFilterEngine';

describe('SearchFilterEngine', () => {
  let filterEngine: SearchFilterEngine;

  const mockRestaurant: TYERestaurant = {
    id: 'test-restaurant-1',
    name: 'Test Restaurant',
    coordinates: { latitude: 58.0105, longitude: 56.2502 },
    workingHours: { open: '09:00', close: '23:00', isOpen: true },
    isActive: true,
    lastUpdated: new Date(),
    additionalInfo: {
      brandSlug: 'test-restaurant'
    }
  };

  const mockMenuItems: TYEMenuItem[] = [
    {
      id: 1,
      name: 'Пицца Маргарита',
      description: 'Классическая пицца с томатами и сыром',
      available: true,
      inStock: true,
      price: 500,
      decimalPrice: '500.00',
      promoTypes: [],
      optionsGroups: [],
      adult: false,
      shippingType: 'delivery',
      publicId: 'item-1',
      ingredients: ['тесто', 'томаты', 'сыр'],
      restaurant: mockRestaurant
    },
    {
      id: 2,
      name: 'Острая пицца',
      description: 'Пицца с острым перцем',
      available: true,
      inStock: true,
      price: 600,
      decimalPrice: '600.00',
      promoTypes: [],
      optionsGroups: [],
      adult: false,
      shippingType: 'delivery',
      publicId: 'item-2',
      ingredients: ['тесто', 'перец', 'острый соус'],
      restaurant: mockRestaurant
    },
    {
      id: 3,
      name: 'Неактивный товар',
      description: 'Недоступный товар',
      available: false,
      inStock: false,
      price: 0,
      decimalPrice: '0.00',
      promoTypes: [],
      optionsGroups: [],
      adult: false,
      shippingType: 'delivery',
      publicId: 'item-3',
      ingredients: [],
      restaurant: { ...mockRestaurant, isActive: false }
    }
  ];

  const mockSearchResults: TSearchResult[] = [
    {
      id: '1',
      name: 'Пицца Маргарита',
      restaurant: { id: 'rest-1', name: 'Test Restaurant' },
      description: 'Классическая пицца с томатами и сыром',
      tags: ['пицца', 'сыр', 'томаты'],
      price: 500,
      orderUrl: 'https://example.com/1'
    },
    {
      id: '2',
      name: 'Острая пицца',
      restaurant: { id: 'rest-1', name: 'Test Restaurant' },
      description: 'Пицца с острым перцем',
      tags: ['пицца', 'острый', 'перец'],
      price: 600,
      orderUrl: 'https://example.com/2'
    },
    {
      id: '3',
      name: 'Неактивный товар',
      restaurant: { id: 'rest-1', name: 'Test Restaurant' },
      description: 'Недоступный товар',
      tags: [],
      price: 0,
      orderUrl: ''
    }
  ];

  beforeEach(() => {
    filterEngine = new SearchFilterEngine({
      enableFuzzyMatching: true,
      strictExclusions: true,
      priceTolerancePercent: 10,
      minimumMatchScore: 0.1
    });
  });

  describe('applyFilters for TYEMenuItem', () => {
    it('should filter out inactive and unavailable items', () => {
      const query: TStructuredQuery = {};
      
      const { filteredItems, stats } = filterEngine.applyFilters(
        mockMenuItems,
        query,
        EAvailableCities.PERM
      );

      expect(filteredItems).toHaveLength(2);
      expect(filteredItems.every(item => item.available)).toBe(true);
      expect(stats.byBusinessLogic).toBe(1);
      expect(stats.totalFiltered).toBe(1);
    });

    it('should filter by restaurant name', () => {
      const query: TStructuredQuery = {
        restaurants: ['Test Restaurant']
      };
      
      const { filteredItems } = filterEngine.applyFilters(
        mockMenuItems.slice(0, 2), // Only active items
        query,
        EAvailableCities.PERM
      );

      expect(filteredItems).toHaveLength(2);
      expect(filteredItems.every(item => 
        item.restaurant.name.includes('Test Restaurant')
      )).toBe(true);
    });

    it('should filter by tags/ingredients', () => {
      const query: TStructuredQuery = {
        tags: ['острый']
      };
      
      const { filteredItems } = filterEngine.applyFilters(
        mockMenuItems.slice(0, 2),
        query,
        EAvailableCities.PERM
      );

      expect(filteredItems).toHaveLength(1);
      expect(filteredItems[0].name).toBe('Острая пицца');
    });

    it('should filter by price range with tolerance', () => {
      const query: TStructuredQuery = {
        priceRange: { min: 450, max: 550 } // 10% tolerance should include 500
      };
      
      const { filteredItems } = filterEngine.applyFilters(
        mockMenuItems.slice(0, 2),
        query,
        EAvailableCities.PERM
      );

      expect(filteredItems).toHaveLength(1);
      expect(filteredItems[0].price).toBe(500);
    });

    it('should apply exclusion filters', () => {
      const query: TStructuredQuery = {
        exclusions: {
          tags: ['острый']
        }
      };
      
      const { filteredItems } = filterEngine.applyFilters(
        mockMenuItems.slice(0, 2),
        query,
        EAvailableCities.PERM
      );

      expect(filteredItems).toHaveLength(1);
      expect(filteredItems[0].name).toBe('Пицца Маргарита');
    });

    it('should exclude restaurants', () => {
      const query: TStructuredQuery = {
        exclusions: {
          restaurants: ['Test Restaurant']
        }
      };
      
      const { filteredItems } = filterEngine.applyFilters(
        mockMenuItems.slice(0, 2),
        query,
        EAvailableCities.PERM
      );

      expect(filteredItems).toHaveLength(0);
    });

    it('should exclude by price range', () => {
      const query: TStructuredQuery = {
        exclusions: {
          priceRange: { min: 450, max: 550 } // Exclude items in this range
        }
      };
      
      const { filteredItems } = filterEngine.applyFilters(
        mockMenuItems.slice(0, 2),
        query,
        EAvailableCities.PERM
      );

      expect(filteredItems).toHaveLength(1);
      expect(filteredItems[0].price).toBe(600); // Only item outside excluded range
    });
  });

  describe('applySearchResultFilters', () => {
    it('should filter search results by business logic', () => {
      const query: TStructuredQuery = {};
      
      const { filteredResults, stats } = filterEngine.applySearchResultFilters(
        mockSearchResults,
        query,
        EAvailableCities.PERM
      );

      expect(filteredResults).toHaveLength(2);
      expect(stats.byBusinessLogic).toBe(1);
      expect(filteredResults.every(result => result.price > 0)).toBe(true);
      expect(filteredResults.every(result => result.orderUrl !== '')).toBe(true);
    });

    it('should filter by restaurant with fuzzy matching', () => {
      const query: TStructuredQuery = {
        restaurants: ['Test']
      };
      
      const { filteredResults } = filterEngine.applySearchResultFilters(
        mockSearchResults.slice(0, 2),
        query,
        EAvailableCities.PERM
      );

      expect(filteredResults).toHaveLength(2);
    });

    it('should filter by tags in search results', () => {
      const query: TStructuredQuery = {
        tags: ['острый']
      };
      
      const { filteredResults } = filterEngine.applySearchResultFilters(
        mockSearchResults.slice(0, 2),
        query,
        EAvailableCities.PERM
      );

      expect(filteredResults).toHaveLength(1);
      expect(filteredResults[0].tags).toContain('острый');
    });

    it('should apply price tolerance correctly', () => {
      const query: TStructuredQuery = {
        priceRange: { min: 500, max: 500 } // Exact price
      };
      
      const { filteredResults } = filterEngine.applySearchResultFilters(
        mockSearchResults.slice(0, 2),
        query,
        EAvailableCities.PERM
      );

      // With 10% tolerance, 500 ± 50 should include prices 450-550
      expect(filteredResults).toHaveLength(1);
      expect(filteredResults[0].price).toBe(500);
    });
  });

  describe('fuzzy vs strict matching', () => {
    it('should use fuzzy matching when enabled', () => {
      const fuzzyEngine = new SearchFilterEngine({
        enableFuzzyMatching: true
      });

      const query: TStructuredQuery = {
        tags: ['пицц'] // Partial match
      };
      
      const { filteredItems } = fuzzyEngine.applyFilters(
        mockMenuItems.slice(0, 2),
        query,
        EAvailableCities.PERM
      );

      expect(filteredItems).toHaveLength(2); // Both pizzas should match
    });

    it('should use strict matching when disabled', () => {
      const strictEngine = new SearchFilterEngine({
        enableFuzzyMatching: false
      });

      const query: TStructuredQuery = {
        tags: ['пицц'] // Partial match - should not work in strict mode
      };
      
      const { filteredItems } = strictEngine.applyFilters(
        mockMenuItems.slice(0, 2),
        query,
        EAvailableCities.PERM
      );

      expect(filteredItems).toHaveLength(0); // No exact matches
    });
  });

  describe('exclusion strictness', () => {
    it('should apply strict exclusions when enabled', () => {
      const strictEngine = new SearchFilterEngine({
        strictExclusions: true
      });

      const query: TStructuredQuery = {
        exclusions: {
          tags: ['пицц'] // Partial match should exclude pizzas
        }
      };
      
      const { filteredItems } = strictEngine.applyFilters(
        mockMenuItems.slice(0, 2),
        query,
        EAvailableCities.PERM
      );

      expect(filteredItems).toHaveLength(0); // All should be excluded
    });

    it('should apply loose exclusions when disabled', () => {
      const looseEngine = new SearchFilterEngine({
        strictExclusions: false
      });

      const query: TStructuredQuery = {
        exclusions: {
          tags: ['пицц'] // Partial match - should not exclude in loose mode
        }
      };
      
      const { filteredItems } = looseEngine.applyFilters(
        mockMenuItems.slice(0, 2),
        query,
        EAvailableCities.PERM
      );

      expect(filteredItems).toHaveLength(2); // Nothing excluded
    });
  });

  describe('price tolerance', () => {
    it('should apply custom price tolerance', () => {
      const tolerantEngine = new SearchFilterEngine({
        priceTolerancePercent: 20 // 20% tolerance
      });

      const query: TStructuredQuery = {
        priceRange: { min: 500, max: 500 } // Exact price
      };
      
      const { filteredItems } = tolerantEngine.applyFilters(
        mockMenuItems.slice(0, 2),
        query,
        EAvailableCities.PERM
      );

      // With 20% tolerance: 500 ± 100 = 400-600, both items should pass
      expect(filteredItems).toHaveLength(2);
    });

    it('should handle zero tolerance', () => {
      const strictPriceEngine = new SearchFilterEngine({
        priceTolerancePercent: 0
      });

      const query: TStructuredQuery = {
        priceRange: { min: 500, max: 500 }
      };
      
      const { filteredItems } = strictPriceEngine.applyFilters(
        mockMenuItems.slice(0, 2),
        query,
        EAvailableCities.PERM
      );

      expect(filteredItems).toHaveLength(1);
      expect(filteredItems[0].price).toBe(500);
    });
  });

  describe('filter statistics', () => {
    it('should track filtering statistics accurately', () => {
      const query: TStructuredQuery = {
        restaurants: ['Nonexistent'],
        tags: ['nonexistent'],
        priceRange: { min: 1000, max: 2000 },
        exclusions: {
          restaurants: ['Test Restaurant']
        }
      };
      
      const { filteredItems, stats } = filterEngine.applyFilters(
        mockMenuItems,
        query,
        EAvailableCities.PERM
      );

      expect(filteredItems).toHaveLength(0);
      expect(stats.totalFiltered).toBe(3);
      expect(stats.byBusinessLogic).toBeGreaterThan(0);
    });

    it('should provide filtering statistics breakdown', () => {
      const query: TStructuredQuery = {
        priceRange: { min: 700, max: 800 } // No items in this range
      };
      
      const { stats } = filterEngine.applyFilters(
        mockMenuItems.slice(0, 2), // Only active items
        query,
        EAvailableCities.PERM
      );

      const breakdown = filterEngine.getFilteringStatistics(stats);
      
      expect(breakdown).toContain('цена');
      expect(typeof breakdown).toBe('string');
    });

    it('should handle no filtering', () => {
      const query: TStructuredQuery = {};
      
      const { stats } = filterEngine.applyFilters(
        mockMenuItems.slice(0, 2),
        query,
        EAvailableCities.PERM
      );

      const breakdown = filterEngine.getFilteringStatistics(stats);
      
      if (stats.totalFiltered === 0) {
        expect(breakdown).toContain('не были отфильтрованы');
      }
    });
  });

  describe('validateFilters', () => {
    it('should validate correct filters', () => {
      const validQuery: TStructuredQuery = {
        tags: ['пицца'],
        priceRange: { min: 100, max: 1000 },
        restaurants: ['Test Restaurant']
      };
      
      const validation = filterEngine.validateFilters(validQuery);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid price range', () => {
      const invalidQuery: TStructuredQuery = {
        priceRange: { min: 1000, max: 500 } // Max < Min
      };
      
      const validation = filterEngine.validateFilters(invalidQuery);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Максимальная цена не может быть меньше минимальной');
    });

    it('should detect negative prices', () => {
      const invalidQuery: TStructuredQuery = {
        priceRange: { min: -100, max: 500 }
      };
      
      const validation = filterEngine.validateFilters(invalidQuery);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Минимальная цена не может быть отрицательной');
    });

    it('should detect extremely high prices', () => {
      const invalidQuery: TStructuredQuery = {
        priceRange: { min: 100, max: 200000 }
      };
      
      const validation = filterEngine.validateFilters(invalidQuery);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Максимальная цена слишком высокая');
    });

    it('should validate exclusion price ranges', () => {
      const invalidQuery: TStructuredQuery = {
        exclusions: {
          priceRange: { min: 1000, max: 500 }
        }
      };
      
      const validation = filterEngine.validateFilters(invalidQuery);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty input arrays', () => {
      const query: TStructuredQuery = { tags: ['test'] };
      
      const { filteredItems } = filterEngine.applyFilters(
        [],
        query,
        EAvailableCities.PERM
      );

      expect(filteredItems).toEqual([]);
    });

    it('should handle empty query', () => {
      const query: TStructuredQuery = {};
      
      const { filteredItems } = filterEngine.applyFilters(
        mockMenuItems.slice(0, 2),
        query,
        EAvailableCities.PERM
      );

      expect(filteredItems).toHaveLength(2); // Should pass all valid items
    });

    it('should handle malformed items', () => {
      const malformedItems = [
        {
          ...mockMenuItems[0],
          id: null,
          name: '',
          restaurant: null
        } as unknown as TYEMenuItem
      ];
      
      const query: TStructuredQuery = {};
      
      const { filteredItems, stats } = filterEngine.applyFilters(
        malformedItems,
        query,
        EAvailableCities.PERM
      );

      expect(filteredItems).toHaveLength(0);
      expect(stats.byBusinessLogic).toBe(1);
    });
  });
});