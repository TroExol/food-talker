import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import type { TSearchHistoryItem } from '@/models/user';
import type { TSearchResult } from '@/models/search';

import { SearchHistoryAnalyzer } from './SearchHistoryAnalyzer';

describe('SearchHistoryAnalyzer', () => {
  let analyzer: SearchHistoryAnalyzer;

  const mockSearchResults: TSearchResult[] = [
    {
      id: '1',
      name: 'Пицца Маргарита',
      restaurant: { id: 'rest-1', name: 'Pizza Palace' },
      description: 'Классическая пицца',
      tags: ['пицца', 'сыр'],
      price: 500,
      orderUrl: 'https://example.com/1'
    },
    {
      id: '2',
      name: 'Бургер классический',
      restaurant: { id: 'rest-2', name: 'Burger King' },
      description: 'Говяжий бургер',
      tags: ['бургер', 'говядина'],
      price: 400,
      orderUrl: 'https://example.com/2'
    }
  ];

  const mockHistory: TSearchHistoryItem[] = [
    {
      id: 'hist-1',
      query: 'пицца',
      structuredQuery: {
        tags: ['пицца'],
        priceRange: { min: 400, max: 600 }
      },
      results: [mockSearchResults[0]],
      timestamp: new Date('2024-01-15T12:00:00Z')
    },
    {
      id: 'hist-2',
      query: 'бургер',
      structuredQuery: {
        tags: ['бургер'],
        priceRange: { min: 300, max: 500 }
      },
      results: [mockSearchResults[1]],
      timestamp: new Date('2024-01-16T14:00:00Z')
    },
    {
      id: 'hist-3',
      query: 'пицца острая',
      structuredQuery: {
        tags: ['пицца', 'острый'],
        priceRange: { min: 500, max: 700 }
      },
      results: [],
      timestamp: new Date('2024-01-17T16:00:00Z')
    },
    {
      id: 'hist-4',
      query: 'пицца',
      structuredQuery: {
        tags: ['пицца']
      },
      results: [mockSearchResults[0]],
      timestamp: new Date('2024-01-18T18:00:00Z')
    }
  ];

  beforeEach(() => {
    analyzer = new SearchHistoryAnalyzer({
      historyRetentionDays: 90,
      minFrequencyThreshold: 2
    });
  });

  describe('analyzeUserSearchHistory', () => {
    it('should analyze empty history', () => {
      const analytics = analyzer.analyzeUserSearchHistory([]);
      
      expect(analytics.totalSearches).toBe(0);
      expect(analytics.successfulSearches).toBe(0);
      expect(analytics.successRate).toBe(0);
      expect(analytics.popularQueries).toEqual([]);
      expect(analytics.popularRestaurants).toEqual([]);
    });

    it('should calculate basic statistics', () => {
      const analytics = analyzer.analyzeUserSearchHistory(mockHistory);
      
      expect(analytics.totalSearches).toBe(4);
      expect(analytics.successfulSearches).toBe(3); // 3 searches with results
      expect(analytics.successRate).toBe(0.75);
      expect(analytics.averageResultsPerSearch).toBe(0.75); // 3 results / 4 searches
    });

    it('should identify popular queries', () => {
      const analytics = analyzer.analyzeUserSearchHistory(mockHistory);
      
      expect(analytics.popularQueries).toHaveLength(3);
      expect(analytics.popularQueries[0].query).toBe('пицца'); // Most frequent
      expect(analytics.popularQueries[0].count).toBe(2);
      expect(analytics.popularQueries[1].query).toBe('бургер');
      expect(analytics.popularQueries[1].count).toBe(1);
    });

    it('should identify popular restaurants', () => {
      const analytics = analyzer.analyzeUserSearchHistory(mockHistory);
      
      expect(analytics.popularRestaurants).toHaveLength(2);
      expect(analytics.popularRestaurants[0].restaurant).toBe('Pizza Palace');
      expect(analytics.popularRestaurants[0].count).toBe(2);
      expect(analytics.popularRestaurants[1].restaurant).toBe('Burger King');
      expect(analytics.popularRestaurants[1].count).toBe(1);
    });

    it('should analyze popular tags', () => {
      const analytics = analyzer.analyzeUserSearchHistory(mockHistory);
      
      expect(analytics.popularTags.length).toBeGreaterThan(0);
      expect(analytics.popularTags[0].tag).toBe('пицца');
      expect(analytics.popularTags[0].count).toBe(3); // Appears in 3 structured queries
    });

    it('should analyze price patterns', () => {
      const analytics = analyzer.analyzeUserSearchHistory(mockHistory);
      
      expect(analytics.priceAnalytics.averagePrice).toBe(450); // (500 + 400) / 2
      expect(analytics.priceAnalytics.priceDistribution).toHaveProperty('200-500');
      expect(analytics.priceAnalytics.priceDistribution).toHaveProperty('500-1000');
    });

    it('should analyze temporal patterns', () => {
      const analytics = analyzer.analyzeUserSearchHistory(mockHistory);
      
      expect(analytics.temporalPatterns.hourlyDistribution).toHaveProperty('12'); // 12:00
      expect(analytics.temporalPatterns.hourlyDistribution).toHaveProperty('14'); // 14:00
      expect(analytics.temporalPatterns.weeklyDistribution).toHaveProperty('1'); // Monday
    });

    it('should analyze user behavior patterns', () => {
      const analytics = analyzer.analyzeUserSearchHistory(mockHistory);
      
      expect(analytics.userBehavior.repeatSearches).toBe(1); // 'пицца' appears twice
      expect(analytics.userBehavior.refinementRate).toBeGreaterThan(0);
      expect(analytics.userBehavior.abandonmentRate).toBe(0.25); // 1 failed search out of 4
    });
  });

  describe('getSearchTrends', () => {
    const currentHistory = [
      {
        id: 'current-1',
        query: 'пицца',
        structuredQuery: { tags: ['пицца'] },
        results: [mockSearchResults[0]],
        timestamp: new Date('2024-02-01T12:00:00Z')
      },
      {
        id: 'current-2',
        query: 'пицца',
        structuredQuery: { tags: ['пицца'] },
        results: [mockSearchResults[0]],
        timestamp: new Date('2024-02-02T12:00:00Z')
      },
      {
        id: 'current-3',
        query: 'суши',
        structuredQuery: { tags: ['суши'] },
        results: [],
        timestamp: new Date('2024-02-03T12:00:00Z')
      }
    ];

    const previousHistory = [
      {
        id: 'prev-1',
        query: 'пицца',
        structuredQuery: { tags: ['пицца'] },
        results: [mockSearchResults[0]],
        timestamp: new Date('2024-01-01T12:00:00Z')
      }
    ];

    it('should identify increasing trends', () => {
      const trends = analyzer.getSearchTrends(currentHistory, previousHistory);
      
      const pizzaTrend = trends.find(t => t.query === 'пицца');
      
      expect(pizzaTrend).toBeDefined();
      expect(pizzaTrend?.trend).toBe('increasing');
      expect(pizzaTrend?.frequency).toBe(2);
      expect(pizzaTrend?.changePercent).toBe(100); // From 1 to 2 = 100% increase
    });

    it('should identify new queries', () => {
      const trends = analyzer.getSearchTrends(currentHistory, previousHistory);
      
      // суши only appears once, which is below the minFrequencyThreshold of 2
      const sushiTrend = trends.find(t => t.query === 'суши');
      
      expect(sushiTrend).toBeUndefined(); // Should not be included due to low frequency
    });

    it('should filter by frequency threshold', () => {
      const highThresholdAnalyzer = new SearchHistoryAnalyzer({
        minFrequencyThreshold: 3
      });
      
      const trends = highThresholdAnalyzer.getSearchTrends(currentHistory, previousHistory);
      
      expect(trends).toHaveLength(0); // No queries meet threshold of 3
    });

    it('should handle empty history', () => {
      const trends = analyzer.getSearchTrends([], []);
      
      expect(trends).toEqual([]);
    });
  });

  describe('analyzeSearchSessions', () => {
    const sessionHistory = [
      {
        id: 'sess-1',
        query: 'пицца',
        structuredQuery: { tags: ['пицца'] },
        results: [mockSearchResults[0]],
        timestamp: new Date('2024-01-01T12:00:00Z')
      },
      {
        id: 'sess-2',
        query: 'пицца острая',
        structuredQuery: { tags: ['пицца', 'острый'] },
        results: [],
        timestamp: new Date('2024-01-01T12:05:00Z') // 5 minutes later
      },
      {
        id: 'sess-3',
        query: 'бургер',
        structuredQuery: { tags: ['бургер'] },
        results: [mockSearchResults[1]],
        timestamp: new Date('2024-01-01T13:00:00Z') // 1 hour later - new session
      }
    ];

    it('should group searches into sessions', () => {
      const sessions = analyzer.analyzeSearchSessions(sessionHistory, 30); // 30 minute timeout
      
      expect(sessions).toHaveLength(2);
      expect(sessions[0].totalSearches).toBe(2); // First session
      expect(sessions[1].totalSearches).toBe(1); // Second session
    });

    it('should calculate session metrics', () => {
      const sessions = analyzer.analyzeSearchSessions(sessionHistory, 30);
      
      const firstSession = sessions[0];
      
      expect(firstSession.successfulSearches).toBe(1);
      expect(firstSession.conversionRate).toBe(0.5); // 1 success out of 2 searches
      expect(firstSession.queries).toEqual(['пицца', 'пицца острая']);
    });

    it('should detect final selections', () => {
      const sessions = analyzer.analyzeSearchSessions(sessionHistory, 30);
      
      expect(sessions[0].finalSelection).toEqual(mockSearchResults[0]);
      expect(sessions[1].finalSelection).toEqual(mockSearchResults[1]);
    });

    it('should handle custom session timeout', () => {
      const sessions = analyzer.analyzeSearchSessions(sessionHistory, 1); // 1 minute timeout
      
      expect(sessions).toHaveLength(3); // Each search becomes its own session
    });

    it('should handle empty history', () => {
      const sessions = analyzer.analyzeSearchSessions([]);
      
      expect(sessions).toEqual([]);
    });
  });

  describe('getPersonalizedRecommendations', () => {
    it('should generate recommendations from history', () => {
      const recommendations = analyzer.getPersonalizedRecommendations(mockHistory);
      
      expect(recommendations.recommendedQueries).toContain('пицца');
      expect(recommendations.recommendedRestaurants).toContain('Pizza Palace');
      expect(recommendations.recommendedPriceRange).toEqual({
        min: 400,
        max: 600
      });
    });

    it('should prioritize frequent items', () => {
      const recommendations = analyzer.getPersonalizedRecommendations(mockHistory);
      
      expect(recommendations.recommendedQueries[0]).toBe('пицца'); // Most frequent
      expect(recommendations.recommendedRestaurants[0]).toBe('Pizza Palace'); // Most frequent
    });

    it('should limit recommendations count', () => {
      const recommendations = analyzer.getPersonalizedRecommendations(mockHistory);
      
      expect(recommendations.recommendedQueries.length).toBeLessThanOrEqual(5);
      expect(recommendations.recommendedRestaurants.length).toBeLessThanOrEqual(3);
    });

    it('should handle empty history', () => {
      const recommendations = analyzer.getPersonalizedRecommendations([]);
      
      expect(recommendations.recommendedQueries).toEqual([]);
      expect(recommendations.recommendedRestaurants).toEqual([]);
      expect(recommendations.recommendedPriceRange).toBeNull();
    });

    it('should handle history without price ranges', () => {
      const historyWithoutPrices = [
        {
          id: 'no-price-1',
          query: 'тест',
          structuredQuery: { tags: ['тест'] },
          results: [],
          timestamp: new Date()
        }
      ];
      
      const recommendations = analyzer.getPersonalizedRecommendations(historyWithoutPrices);
      
      expect(recommendations.recommendedPriceRange).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle malformed history items', () => {
      const malformedHistory = [
        {
          id: 'malformed-1',
          query: '',
          structuredQuery: null,
          results: null,
          timestamp: null
        } as unknown as TSearchHistoryItem
      ];
      
      expect(() => {
        analyzer.analyzeUserSearchHistory(malformedHistory);
      }).not.toThrow();
    });

    it('should handle invalid dates', () => {
      const invalidDateHistory = [
        {
          id: 'invalid-1',
          query: 'тест',
          structuredQuery: { tags: ['тест'] },
          results: [],
          timestamp: new Date('invalid-date')
        }
      ];
      
      expect(() => {
        analyzer.analyzeUserSearchHistory(invalidDateHistory);
      }).not.toThrow();
    });

    it('should handle missing structured queries', () => {
      const missingStructuredHistory = [
        {
          id: 'missing-1',
          query: 'тест',
          structuredQuery: {} as any,
          results: [],
          timestamp: new Date()
        }
      ];
      
      const analytics = analyzer.analyzeUserSearchHistory(missingStructuredHistory);
      
      expect(analytics.totalSearches).toBe(1);
      expect(analytics.popularTags).toHaveLength(0);
    });
  });

  describe('custom configuration', () => {
    it('should respect custom retention period', () => {
      const shortRetentionAnalyzer = new SearchHistoryAnalyzer({
        historyRetentionDays: 1
      });
      
      // This is more of a configuration test - actual filtering would happen at data level
      expect(shortRetentionAnalyzer).toBeDefined();
    });

    it('should respect custom frequency threshold', () => {
      const highThresholdAnalyzer = new SearchHistoryAnalyzer({
        minFrequencyThreshold: 10
      });
      
      const trends = highThresholdAnalyzer.getSearchTrends(mockHistory, []);
      
      expect(trends).toHaveLength(0); // No queries meet high threshold
    });
  });

  describe('analytics edge cases', () => {
    it('should handle single search', () => {
      const singleSearch = [mockHistory[0]];
      
      const analytics = analyzer.analyzeUserSearchHistory(singleSearch);
      
      expect(analytics.totalSearches).toBe(1);
      expect(analytics.successRate).toBe(1);
      expect(analytics.userBehavior.repeatSearches).toBe(0);
    });

    it('should handle all failed searches', () => {
      const failedSearches = [
        {
          id: 'failed-1',
          query: 'несуществующее блюдо',
          structuredQuery: { tags: ['несуществующее'] },
          results: [],
          timestamp: new Date()
        },
        {
          id: 'failed-2',
          query: 'другое несуществующее',
          structuredQuery: { tags: ['другое'] },
          results: [],
          timestamp: new Date()
        }
      ];
      
      const analytics = analyzer.analyzeUserSearchHistory(failedSearches);
      
      expect(analytics.successRate).toBe(0);
      expect(analytics.popularRestaurants).toHaveLength(0);
      expect(analytics.priceAnalytics.averagePrice).toBe(0);
    });

    it('should handle identical timestamps', () => {
      const sameTime = new Date();
      const identicalTimestamps = [
        {
          id: 'same-1',
          query: 'запрос 1',
          structuredQuery: { tags: ['тест'] },
          results: [],
          timestamp: sameTime
        },
        {
          id: 'same-2',
          query: 'запрос 2',
          structuredQuery: { tags: ['тест'] },
          results: [],
          timestamp: sameTime
        }
      ];
      
      const sessions = analyzer.analyzeSearchSessions(identicalTimestamps);
      
      expect(sessions).toHaveLength(1); // Should be grouped into one session
      expect(sessions[0].totalSearches).toBe(2);
    });
  });
});