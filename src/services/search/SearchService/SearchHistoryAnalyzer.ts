import type { TSearchHistoryItem } from '@/models/user';
import type { TSearchResult, TSearchHistoryMetrics } from '@/models/search';

import { logger } from '@/utils/logger';

export interface TSearchAnalytics {
  totalSearches: number;
  successfulSearches: number;
  averageResponseTime: number;
  averageResultsPerSearch: number;
  successRate: number;
  popularQueries: Array<{ query: string; count: number; lastUsed: Date }>;
  popularRestaurants: Array<{ restaurant: string; count: number; lastUsed: Date }>;
  popularTags: Array<{ tag: string; count: number; popularity: number }>;
  priceAnalytics: {
    averagePrice: number;
    mostCommonPriceRange: { min: number; max: number };
    priceDistribution: Record<string, number>;
  };
  temporalPatterns: {
    hourlyDistribution: Record<number, number>;
    weeklyDistribution: Record<number, number>;
  };
  userBehavior: {
    repeatSearches: number;
    refinementRate: number;
    abandonmentRate: number;
  };
}

export interface TSearchTrend {
  query: string;
  frequency: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercent: number;
}

export interface TSearchSessionAnalytics {
  sessionId: string;
  userId: number;
  startTime: Date;
  endTime: Date;
  totalSearches: number;
  successfulSearches: number;
  queries: string[];
  finalSelection?: TSearchResult;
  conversionRate: number;
}

export class SearchHistoryAnalyzer {
  private readonly historyRetentionDays: number;
  private readonly minFrequencyThreshold: number;

  constructor(config?: { historyRetentionDays?: number; minFrequencyThreshold?: number }) {
    this.historyRetentionDays = config?.historyRetentionDays ?? 90;
    this.minFrequencyThreshold = config?.minFrequencyThreshold ?? 2;
  }

  public analyzeUserSearchHistory(history: TSearchHistoryItem[]): TSearchAnalytics {
    if (history.length === 0) {
      return this.getEmptyAnalytics();
    }

    try {
      const analytics: TSearchAnalytics = {
        totalSearches: history.length,
        successfulSearches: this.calculateSuccessfulSearches(history),
        averageResponseTime: this.calculateAverageResponseTime(history),
        averageResultsPerSearch: this.calculateAverageResultsPerSearch(history),
        successRate: 0, // Will be calculated
        popularQueries: this.getPopularQueries(history),
        popularRestaurants: this.getPopularRestaurants(history),
        popularTags: this.getPopularTags(history),
        priceAnalytics: this.analyzePrices(history),
        temporalPatterns: this.analyzeTemporalPatterns(history),
        userBehavior: this.analyzeUserBehavior(history),
      };

      analytics.successRate = analytics.totalSearches > 0 
        ? analytics.successfulSearches / analytics.totalSearches 
        : 0;

      return analytics;
    } catch (error) {
      logger.error('Ошибка анализа истории поиска', error as Error);
      return this.getEmptyAnalytics();
    }
  }

  public getSearchTrends(currentHistory: TSearchHistoryItem[], previousHistory: TSearchHistoryItem[]): TSearchTrend[] {
    try {
      const currentQueries = this.getQueryFrequency(currentHistory);
      const previousQueries = this.getQueryFrequency(previousHistory);
      
      const trends: TSearchTrend[] = [];

      // Analyze current queries
      Object.entries(currentQueries).forEach(([query, currentCount]) => {
        const previousCount = previousQueries[query] || 0;
        let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
        let changePercent = 0;

        if (previousCount === 0 && currentCount > 0) {
          trend = 'increasing';
          changePercent = 100;
        } else if (previousCount > 0) {
          changePercent = ((currentCount - previousCount) / previousCount) * 100;
          if (changePercent > 10) {
            trend = 'increasing';
          } else if (changePercent < -10) {
            trend = 'decreasing';
          }
        }

        if (currentCount >= this.minFrequencyThreshold) {
          trends.push({
            query,
            frequency: currentCount,
            trend,
            changePercent: Math.round(changePercent)
          });
        }
      });

      return trends.sort((a, b) => b.frequency - a.frequency);
    } catch (error) {
      logger.error('Ошибка анализа трендов поиска', error as Error);
      return [];
    }
  }

  public analyzeSearchSessions(history: TSearchHistoryItem[], sessionTimeoutMinutes = 30): TSearchSessionAnalytics[] {
    if (history.length === 0) return [];

    try {
      const sessions: TSearchSessionAnalytics[] = [];
      const sortedHistory = [...history].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      let currentSession: TSearchSessionAnalytics | null = null;
      const sessionTimeout = sessionTimeoutMinutes * 60 * 1000; // Convert to milliseconds

      sortedHistory.forEach((item, index) => {
        const itemTime = item.timestamp.getTime();

        // Check if we need to start a new session
        if (!currentSession || 
            (currentSession && itemTime - currentSession.endTime.getTime() > sessionTimeout)) {
          
          // Save previous session if exists
          if (currentSession) {
            sessions.push(currentSession);
          }

          // Start new session
          currentSession = {
            sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId: 0, // Will be set from first item
            startTime: item.timestamp,
            endTime: item.timestamp,
            totalSearches: 0,
            successfulSearches: 0,
            queries: [],
            conversionRate: 0
          };
        }

        // Update current session
        if (currentSession) {
          currentSession.endTime = item.timestamp;
          currentSession.totalSearches++;
          currentSession.queries.push(item.query);
          
          if (item.results.length > 0) {
            currentSession.successfulSearches++;
          }

          // Detect final selection (last successful search in session)
          if (item.results.length > 0) {
            currentSession.finalSelection = item.results[0]; // Assume first result is selected
          }

          currentSession.conversionRate = currentSession.totalSearches > 0 
            ? currentSession.successfulSearches / currentSession.totalSearches 
            : 0;
        }
      });

      // Add the last session
      if (currentSession) {
        sessions.push(currentSession);
      }

      return sessions;
    } catch (error) {
      logger.error('Ошибка анализа сессий поиска', error as Error);
      return [];
    }
  }

  public getPersonalizedRecommendations(history: TSearchHistoryItem[]): {
    recommendedQueries: string[];
    recommendedRestaurants: string[];
    recommendedPriceRange: { min: number; max: number } | null;
  } {
    try {
      const analytics = this.analyzeUserSearchHistory(history);
      
      return {
        recommendedQueries: analytics.popularQueries
          .slice(0, 5)
          .map(item => item.query),
        recommendedRestaurants: analytics.popularRestaurants
          .slice(0, 3)
          .map(item => item.restaurant),
        recommendedPriceRange: analytics.priceAnalytics.mostCommonPriceRange.min > 0 
          ? analytics.priceAnalytics.mostCommonPriceRange 
          : null
      };
    } catch (error) {
      logger.error('Ошибка генерации персонализированных рекомендаций', error as Error);
      return {
        recommendedQueries: [],
        recommendedRestaurants: [],
        recommendedPriceRange: null
      };
    }
  }

  // Private helper methods

  private getEmptyAnalytics(): TSearchAnalytics {
    return {
      totalSearches: 0,
      successfulSearches: 0,
      averageResponseTime: 0,
      averageResultsPerSearch: 0,
      successRate: 0,
      popularQueries: [],
      popularRestaurants: [],
      popularTags: [],
      priceAnalytics: {
        averagePrice: 0,
        mostCommonPriceRange: { min: 0, max: 0 },
        priceDistribution: {}
      },
      temporalPatterns: {
        hourlyDistribution: {},
        weeklyDistribution: {}
      },
      userBehavior: {
        repeatSearches: 0,
        refinementRate: 0,
        abandonmentRate: 0
      }
    };
  }

  private calculateSuccessfulSearches(history: TSearchHistoryItem[]): number {
    return history.filter(item => item.results.length > 0).length;
  }

  private calculateAverageResponseTime(history: TSearchHistoryItem[]): number {
    // This would require response time data in the history items
    // For now, return 0 as placeholder
    return 0;
  }

  private calculateAverageResultsPerSearch(history: TSearchHistoryItem[]): number {
    if (history.length === 0) return 0;
    
    const totalResults = history.reduce((sum, item) => sum + item.results.length, 0);
    return totalResults / history.length;
  }

  private getPopularQueries(history: TSearchHistoryItem[]): Array<{ query: string; count: number; lastUsed: Date }> {
    const queryFrequency = new Map<string, { count: number; lastUsed: Date }>();
    
    history.forEach(item => {
      const normalizedQuery = item.query.toLowerCase().trim();
      const existing = queryFrequency.get(normalizedQuery);
      
      if (existing) {
        existing.count++;
        if (item.timestamp > existing.lastUsed) {
          existing.lastUsed = item.timestamp;
        }
      } else {
        queryFrequency.set(normalizedQuery, {
          count: 1,
          lastUsed: item.timestamp
        });
      }
    });
    
    return Array.from(queryFrequency.entries())
      .map(([query, data]) => ({ query, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getPopularRestaurants(history: TSearchHistoryItem[]): Array<{ restaurant: string; count: number; lastUsed: Date }> {
    const restaurantFrequency = new Map<string, { count: number; lastUsed: Date }>();
    
    history.forEach(item => {
      item.results.forEach(result => {
        const restaurant = result.restaurant.name;
        const existing = restaurantFrequency.get(restaurant);
        
        if (existing) {
          existing.count++;
          if (item.timestamp > existing.lastUsed) {
            existing.lastUsed = item.timestamp;
          }
        } else {
          restaurantFrequency.set(restaurant, {
            count: 1,
            lastUsed: item.timestamp
          });
        }
      });
    });
    
    return Array.from(restaurantFrequency.entries())
      .map(([restaurant, data]) => ({ restaurant, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getPopularTags(history: TSearchHistoryItem[]): Array<{ tag: string; count: number; popularity: number }> {
    const tagFrequency = new Map<string, number>();
    let totalTagInstances = 0;
    
    history.forEach(item => {
      if (item.structuredQuery.tags) {
        item.structuredQuery.tags.forEach(tag => {
          const normalizedTag = tag.toLowerCase().trim();
          tagFrequency.set(normalizedTag, (tagFrequency.get(normalizedTag) || 0) + 1);
          totalTagInstances++;
        });
      }
    });
    
    return Array.from(tagFrequency.entries())
      .map(([tag, count]) => ({
        tag,
        count,
        popularity: totalTagInstances > 0 ? count / totalTagInstances : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }

  private analyzePrices(history: TSearchHistoryItem[]): TSearchAnalytics['priceAnalytics'] {
    const prices: number[] = [];
    const priceRanges: Array<{ min: number; max: number }> = [];
    
    history.forEach(item => {
      item.results.forEach(result => {
        prices.push(result.price);
      });
      
      if (item.structuredQuery.priceRange) {
        priceRanges.push(item.structuredQuery.priceRange);
      }
    });

    const averagePrice = prices.length > 0 
      ? prices.reduce((sum, price) => sum + price, 0) / prices.length 
      : 0;

    // Find most common price range
    const rangeFrequency = new Map<string, { range: { min: number; max: number }; count: number }>();
    
    priceRanges.forEach(range => {
      const key = `${range.min}-${range.max}`;
      const existing = rangeFrequency.get(key);
      
      if (existing) {
        existing.count++;
      } else {
        rangeFrequency.set(key, { range, count: 1 });
      }
    });

    const mostCommonRange = Array.from(rangeFrequency.values())
      .sort((a, b) => b.count - a.count)[0]?.range || { min: 0, max: 0 };

    // Price distribution by ranges
    const priceDistribution: Record<string, number> = {
      'до 200': prices.filter(p => p < 200).length,
      '200-500': prices.filter(p => p >= 200 && p < 500).length,
      '500-1000': prices.filter(p => p >= 500 && p < 1000).length,
      '1000-2000': prices.filter(p => p >= 1000 && p < 2000).length,
      'свыше 2000': prices.filter(p => p >= 2000).length,
    };

    return {
      averagePrice: Math.round(averagePrice),
      mostCommonPriceRange: mostCommonRange,
      priceDistribution
    };
  }

  private analyzeTemporalPatterns(history: TSearchHistoryItem[]): TSearchAnalytics['temporalPatterns'] {
    const hourlyDistribution: Record<number, number> = {};
    const weeklyDistribution: Record<number, number> = {};

    // Initialize distributions
    for (let i = 0; i < 24; i++) {
      hourlyDistribution[i] = 0;
    }
    for (let i = 0; i < 7; i++) {
      weeklyDistribution[i] = 0;
    }

    history.forEach(item => {
      const hour = item.timestamp.getHours();
      const dayOfWeek = item.timestamp.getDay();
      
      hourlyDistribution[hour]++;
      weeklyDistribution[dayOfWeek]++;
    });

    return {
      hourlyDistribution,
      weeklyDistribution
    };
  }

  private analyzeUserBehavior(history: TSearchHistoryItem[]): TSearchAnalytics['userBehavior'] {
    const queries = history.map(item => item.query.toLowerCase().trim());
    const uniqueQueries = new Set(queries);
    
    const repeatSearches = queries.length - uniqueQueries.size;
    
    // Calculate refinement rate (searches that are variations of previous searches)
    let refinements = 0;
    for (let i = 1; i < queries.length; i++) {
      const current = queries[i];
      const previous = queries[i - 1];
      
      // Simple heuristic: if current query contains previous query or vice versa
      if (current.includes(previous) || previous.includes(current)) {
        refinements++;
      }
    }
    
    const refinementRate = queries.length > 0 ? refinements / queries.length : 0;
    
    // Calculate abandonment rate (searches with no results)
    const abandonedSearches = history.filter(item => item.results.length === 0).length;
    const abandonmentRate = history.length > 0 ? abandonedSearches / history.length : 0;

    return {
      repeatSearches,
      refinementRate,
      abandonmentRate
    };
  }

  private getQueryFrequency(history: TSearchHistoryItem[]): Record<string, number> {
    const frequency: Record<string, number> = {};
    
    history.forEach(item => {
      const normalizedQuery = item.query.toLowerCase().trim();
      frequency[normalizedQuery] = (frequency[normalizedQuery] || 0) + 1;
    });
    
    return frequency;
  }
}