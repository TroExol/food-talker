import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import type { TSearchResult, TStructuredQuery } from '@/models/search';
import type { TSearchHistoryItem } from '@/models/user';

import { ResultRanker } from './ResultRanker';

describe('ResultRanker', () => {
  let ranker: ResultRanker;

  const mockRestaurant1 = { id: 'rest-1', name: 'Pizza Palace' };
  const mockRestaurant2 = { id: 'rest-2', name: 'Burger King' };

  const mockResults: TSearchResult[] = [
    {
      id: '1',
      name: 'Пицца Маргарита',
      restaurant: mockRestaurant1,
      description: 'Классическая пицца с томатами и сыром',
      tags: ['пицца', 'сыр', 'томаты'],
      price: 500,
      orderUrl: 'https://example.com/1'
    },
    {
      id: '2',
      name: 'Острая пицца',
      restaurant: mockRestaurant1,
      description: 'Пицца с острым перцем и пепперони',
      tags: ['пицца', 'острый', 'пепперони'],
      price: 600,
      orderUrl: 'https://example.com/2'
    },
    {
      id: '3',
      name: 'Бургер классический',
      restaurant: mockRestaurant2,
      description: 'Говяжий бургер с овощами',
      tags: ['бургер', 'говядина', 'овощи'],
      price: 400,
      orderUrl: 'https://example.com/3'
    }
  ];

  beforeEach(() => {
    ranker = new ResultRanker({
      weights: {
        queryMatch: 0.5,
        priceRelevance: 0.3,
        userPreference: 0.2
      }
    });
  });

  describe('rankResults', () => {
    it('should rank results by relevance score', () => {
      const query: TStructuredQuery = {
        tags: ['пицца'],
        priceRange: { min: 400, max: 700 }
      };

      const ranked = ranker.rankResults(mockResults, query);

      expect(ranked).toHaveLength(3);
      expect(ranked[0].rankingScore).toBeGreaterThan(0);
      expect(ranked[1].rankingScore).toBeGreaterThan(0);
      expect(ranked[2].rankingScore).toBeGreaterThan(0);

      // Pizza items should rank higher than burger for pizza query
      expect(ranked[0].tags).toContain('пицца');
      expect(ranked[1].tags).toContain('пицца');
    });

    it('should handle empty results', () => {
      const query: TStructuredQuery = { tags: ['test'] };
      const ranked = ranker.rankResults([], query);
      
      expect(ranked).toEqual([]);
    });

    it('should preserve original results on error', () => {
      // Create an invalid query that might cause errors
      const invalidQuery = {} as TStructuredQuery;
      
      const ranked = ranker.rankResults(mockResults, invalidQuery);
      
      expect(ranked).toHaveLength(mockResults.length);
    });
  });

  describe('calculateRankingScore', () => {
    it('should calculate score based on tag matching', () => {
      const query: TStructuredQuery = {
        tags: ['пицца', 'сыр']
      };

      const score1 = ranker.calculateRankingScore(mockResults[0], query); // Pizza with cheese
      const score2 = ranker.calculateRankingScore(mockResults[2], query); // Burger

      expect(score1).toBeGreaterThan(score2);
    });

    it('should calculate score based on restaurant matching', () => {
      const query: TStructuredQuery = {
        restaurants: ['Pizza Palace']
      };

      const score1 = ranker.calculateRankingScore(mockResults[0], query); // Pizza Palace
      const score2 = ranker.calculateRankingScore(mockResults[2], query); // Burger King

      expect(score1).toBeGreaterThan(score2);
    });

    it('should calculate score based on price range', () => {
      const query: TStructuredQuery = {
        priceRange: { min: 450, max: 550 }
      };

      const score1 = ranker.calculateRankingScore(mockResults[0], query); // 500 - in range
      const score2 = ranker.calculateRankingScore(mockResults[1], query); // 600 - above range

      expect(score1).toBeGreaterThan(score2);
    });

    it('should consider user history preferences', () => {
      const query: TStructuredQuery = { tags: ['пицца'] };
      
      const userHistory: TSearchHistoryItem[] = [
        {
          id: 'hist-1',
          query: 'острая пицца',
          structuredQuery: { tags: ['пицца', 'острый'] },
          results: [mockResults[1]], // User previously selected spicy pizza
          timestamp: new Date()
        }
      ];

      const scoreWithHistory = ranker.calculateRankingScore(mockResults[1], query, userHistory);
      const scoreWithoutHistory = ranker.calculateRankingScore(mockResults[1], query);

      expect(scoreWithHistory).toBeGreaterThan(scoreWithoutHistory);
    });

    it('should ensure scores are between 0 and 1', () => {
      const query: TStructuredQuery = {
        tags: ['пицца'],
        restaurants: ['Pizza Palace'],
        priceRange: { min: 400, max: 600 }
      };

      mockResults.forEach(result => {
        const score = ranker.calculateRankingScore(result, query);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('tag matching', () => {
    it('should give higher scores for exact tag matches', () => {
      const query: TStructuredQuery = { tags: ['пицца'] };
      
      const pizzaScore = ranker.calculateRankingScore(mockResults[0], query);
      const burgerScore = ranker.calculateRankingScore(mockResults[2], query);

      expect(pizzaScore).toBeGreaterThan(burgerScore);
    });

    it('should handle fuzzy tag matching', () => {
      const query: TStructuredQuery = { tags: ['острый'] };
      
      const spicyPizzaScore = ranker.calculateRankingScore(mockResults[1], query);
      const regularPizzaScore = ranker.calculateRankingScore(mockResults[0], query);

      expect(spicyPizzaScore).toBeGreaterThan(regularPizzaScore);
    });

    it('should match tags in item name and description', () => {
      const customRanker = new ResultRanker();
      const query: TStructuredQuery = { tags: ['классический'] };
      
      const classicBurgerScore = customRanker.calculateRankingScore(mockResults[2], query);
      
      expect(classicBurgerScore).toBeGreaterThan(0);
    });
  });

  describe('price relevance calculation', () => {
    it('should give perfect score for prices within range', () => {
      const customRanker = new ResultRanker({
        weights: { queryMatch: 0, priceRelevance: 1, userPreference: 0 }
      });
      
      const query: TStructuredQuery = {
        priceRange: { min: 400, max: 600 }
      };

      const score = customRanker.calculateRankingScore(mockResults[0], query); // 500 - in range
      
      expect(score).toBeGreaterThan(0.8); // Should be high score
    });

    it('should give lower score for prices outside range', () => {
      const customRanker = new ResultRanker({
        weights: { queryMatch: 0, priceRelevance: 1, userPreference: 0 }
      });
      
      const query: TStructuredQuery = {
        priceRange: { min: 100, max: 300 }
      };

      const score = customRanker.calculateRankingScore(mockResults[0], query); // 500 - above range
      
      expect(score).toBeLessThan(0.8);
    });

    it('should give neutral score when no price range specified', () => {
      const customRanker = new ResultRanker({
        weights: { queryMatch: 0, priceRelevance: 1, userPreference: 0 }
      });
      
      const query: TStructuredQuery = { tags: ['test'] };

      const score = customRanker.calculateRankingScore(mockResults[0], query);
      
      expect(score).toBeCloseTo(0.5, 1); // Allow some tolerance
    });
  });

  describe('user preference calculation', () => {
    it('should give higher scores for frequently used restaurants', () => {
      const customRanker = new ResultRanker({
        weights: { queryMatch: 0, priceRelevance: 0, userPreference: 1 }
      });
      
      const query: TStructuredQuery = { tags: ['test'] };
      
      const userHistory: TSearchHistoryItem[] = [
        {
          id: 'hist-1',
          query: 'пицца',
          structuredQuery: { tags: ['пицца'] },
          results: [mockResults[0]], // Pizza Palace
          timestamp: new Date()
        },
        {
          id: 'hist-2',
          query: 'еда',
          structuredQuery: { tags: ['еда'] },
          results: [mockResults[0]], // Pizza Palace again
          timestamp: new Date()
        }
      ];

      const pizzaPalaceScore = customRanker.calculateRankingScore(mockResults[0], query, userHistory);
      const burgerKingScore = customRanker.calculateRankingScore(mockResults[2], query, userHistory);

      expect(pizzaPalaceScore).toBeGreaterThan(burgerKingScore);
    });

    it('should consider recency of user preferences', () => {
      const customRanker = new ResultRanker({
        weights: { queryMatch: 0, priceRelevance: 0, userPreference: 1 }
      });
      
      const query: TStructuredQuery = { tags: ['test'] };
      
      const recentHistory: TSearchHistoryItem[] = [
        {
          id: 'hist-1',
          query: 'recent',
          structuredQuery: { tags: ['test'] },
          results: [mockResults[0]],
          timestamp: new Date() // Very recent
        }
      ];

      const oldHistory: TSearchHistoryItem[] = [
        {
          id: 'hist-1',
          query: 'old',
          structuredQuery: { tags: ['test'] },
          results: [mockResults[0]],
          timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
        }
      ];

      const recentScore = customRanker.calculateRankingScore(mockResults[0], query, recentHistory);
      const oldScore = customRanker.calculateRankingScore(mockResults[0], query, oldHistory);

      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it('should give neutral score with no history', () => {
      const customRanker = new ResultRanker({
        weights: { queryMatch: 0, priceRelevance: 0, userPreference: 1 }
      });
      
      const query: TStructuredQuery = { tags: ['test'] };
      
      const score = customRanker.calculateRankingScore(mockResults[0], query);
      
      expect(score).toBeCloseTo(0.5, 1); // Allow some tolerance
    });
  });

  describe('boosts and penalties', () => {
    it('should apply boosts for exact matches', () => {
      const rankerWithBoosts = new ResultRanker({
        boosts: {
          exactNameMatch: 0.3,
          exactRestaurantMatch: 0.2,
          recentUserPreference: 0.1,
          priceRangeCenter: 0.1
        }
      });

      const query: TStructuredQuery = {
        tags: ['пицца'], // Exact match in name
        restaurants: ['Pizza Palace'], // Exact restaurant match
        priceRange: { min: 480, max: 520 } // 500 is in center
      };

      const baseRanker = new ResultRanker();
      
      const boostedScore = rankerWithBoosts.calculateRankingScore(mockResults[0], query);
      const baseScore = baseRanker.calculateRankingScore(mockResults[0], query);

      expect(boostedScore).toBeGreaterThan(baseScore);
    });

    it('should apply penalties for exclusions', () => {
      const rankerWithPenalties = new ResultRanker({
        penalties: {
          priceOutOfRange: 0.3,
          noTagMatch: 0.2,
          excludedContent: 0.5
        }
      });

      const query: TStructuredQuery = {
        priceRange: { min: 100, max: 200 }, // Price way out of range
        exclusions: {
          tags: ['сыр'] // Exclude cheese items
        }
      };

      const penalizedScore = rankerWithPenalties.calculateRankingScore(mockResults[0], query);
      
      expect(penalizedScore).toBeLessThan(0.5); // Should be low due to penalties
    });
  });

  describe('custom configuration', () => {
    it('should respect custom weights', () => {
      const priceOnlyRanker = new ResultRanker({
        weights: {
          queryMatch: 0,
          priceRelevance: 1,
          userPreference: 0
        }
      });

      const query: TStructuredQuery = {
        tags: ['бургер'], // This should not matter
        priceRange: { min: 350, max: 450 } // Burger (400) is in range, pizzas are not
      };

      const ranked = priceOnlyRanker.rankResults(mockResults, query);
      
      // Burger should rank highest despite tag mismatch
      expect(ranked[0].id).toBe('3'); // Burger
    });

    it('should handle edge case weights', () => {
      const edgeRanker = new ResultRanker({
        weights: {
          queryMatch: 0,
          priceRelevance: 0,
          userPreference: 0
        }
      });

      const query: TStructuredQuery = { tags: ['test'] };
      
      mockResults.forEach(result => {
        const score = edgeRanker.calculateRankingScore(result, query);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });
    });
  });
});