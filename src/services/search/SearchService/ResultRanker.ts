import type { TSearchHistoryItem } from '@/models/user';
import type {
  TRankingCriteria,
  TSearchResult,
  TStructuredQuery,
} from '@/models/search';

import { logger } from '@/utils/logger';

export interface TRankingWeights {
  queryMatch: number;
  priceRelevance: number;
  userPreference: number;
}

export interface TRankingConfig {
  weights: TRankingWeights;
  boosts: {
    exactNameMatch: number;
    exactRestaurantMatch: number;
    recentUserPreference: number;
    priceRangeCenter: number;
  };
  penalties: {
    priceOutOfRange: number;
    noTagMatch: number;
    excludedContent: number;
  };
}

export class ResultRanker {
  private readonly config: TRankingConfig;

  constructor(config?: Partial<TRankingConfig>) {
    this.config = {
      weights: {
        queryMatch: config?.weights?.queryMatch ?? 0.4,
        priceRelevance: config?.weights?.priceRelevance ?? 0.25,
        userPreference: config?.weights?.userPreference ?? 0.35,
      },
      boosts: {
        exactNameMatch: config?.boosts?.exactNameMatch ?? 0.3,
        exactRestaurantMatch: config?.boosts?.exactRestaurantMatch ?? 0.2,
        recentUserPreference: config?.boosts?.recentUserPreference ?? 0.25,
        priceRangeCenter: config?.boosts?.priceRangeCenter ?? 0.15,
      },
      penalties: {
        priceOutOfRange: config?.penalties?.priceOutOfRange ?? 0.3,
        noTagMatch: config?.penalties?.noTagMatch ?? 0.2,
        excludedContent: config?.penalties?.excludedContent ?? 0.5,
      },
    };
  }

  public rankResults(
    results: TSearchResult[],
    query: TStructuredQuery,
    userHistory?: TSearchHistoryItem[],
  ): TSearchResult[] {
    if (results.length === 0) return results;

    try {
      const rankedResults = results.map(result => ({
        ...result,
        rankingScore: this.calculateRankingScore(result, query, userHistory),
      }));

      // Sort by ranking score (highest first)
      return rankedResults.sort((a, b) => (b.rankingScore || 0) - (a.rankingScore || 0));
    } catch (error) {
      logger.error('Ошибка ранжирования результатов', error as Error);
      return results; // Return original order on error
    }
  }

  public calculateRankingScore(
    result: TSearchResult,
    query: TStructuredQuery,
    userHistory?: TSearchHistoryItem[],
  ): number {
    const criteria = this.calculateRankingCriteria(result, query, userHistory);

    let score = (
      criteria.queryMatchScore * this.config.weights.queryMatch
      + criteria.priceRelevance * this.config.weights.priceRelevance
      + criteria.userPreference * this.config.weights.userPreference
    );

    // Apply boosts and penalties
    score += this.calculateBoosts(result, query, userHistory);
    score -= this.calculatePenalties(result, query);

    // Ensure score is between 0 and 1
    return Math.max(0, Math.min(1, score));
  }

  private calculateRankingCriteria(
    result: TSearchResult,
    query: TStructuredQuery,
    userHistory?: TSearchHistoryItem[],
  ): TRankingCriteria {
    return {
      queryMatchScore: this.calculateQueryMatchScore(result, query),
      priceRelevance: this.calculatePriceRelevance(result, query),
      userPreference: this.calculateUserPreference(result, userHistory),
    };
  }

  private calculateQueryMatchScore(result: TSearchResult, query: TStructuredQuery): number {
    let score = 0;
    let totalWeight = 0;

    // Tag matching with fuzzy search
    if (query.tags && query.tags.length > 0) {
      const tagWeight = 0.5;
      totalWeight += tagWeight;

      const matchScore = this.calculateTagMatchScore(result, query.tags);
      score += matchScore * tagWeight;
    }

    // Restaurant name matching
    if (query.restaurants && query.restaurants.length > 0) {
      const restaurantWeight = 0.3;
      totalWeight += restaurantWeight;

      const restaurantMatch = this.calculateRestaurantMatchScore(result, query.restaurants);
      score += restaurantMatch * restaurantWeight;
    }

    // Item name matching (implicit from natural language)
    const nameWeight = 0.2;
    totalWeight += nameWeight;

    const nameMatch = this.calculateNameMatchScore(result, query);
    score += nameMatch * nameWeight;

    return totalWeight > 0 ? score / totalWeight : 0.5;
  }

  private calculateTagMatchScore(result: TSearchResult, queryTags: string[]): number {
    let matchScore = 0;
    const searchableText = [
      result.name.toLowerCase(),
      result.description.toLowerCase(),
      ...result.tags.map(tag => tag.toLowerCase()),
    ].join(' ');

    queryTags.forEach(queryTag => {
      const tag = queryTag.toLowerCase();

      // Exact match in tags
      if (result.tags.some(resultTag => resultTag.toLowerCase().includes(tag))) {
        matchScore += 0.8;
      } else if (result.name.toLowerCase().includes(tag)) {
        // Match in item name
        matchScore += 0.6;
      } else if (result.description.toLowerCase().includes(tag)) {
        // Match in description
        matchScore += 0.4;
      } else if (searchableText.includes(tag)) {
        // Fuzzy match in any text
        matchScore += 0.2;
      }
    });

    return Math.min(matchScore / queryTags.length, 1.0);
  }

  private calculateRestaurantMatchScore(result: TSearchResult, queryRestaurants: string[]): number {
    const restaurantName = result.restaurant.name.toLowerCase();

    for (const queryRestaurant of queryRestaurants) {
      const restaurant = queryRestaurant.toLowerCase();

      // Exact match
      if (restaurantName === restaurant) {
        return 1.0;
      }
      // Partial match
      if (restaurantName.includes(restaurant) || restaurant.includes(restaurantName)) {
        return 0.8;
      }
    }

    return 0;
  }

  private calculateNameMatchScore(result: TSearchResult, query: TStructuredQuery): number {
    // This is a simplified implementation
    // In a real scenario, you might want to use the original natural language query
    const itemName = result.name.toLowerCase();
    let matchScore = 0;

    // Check against tags and restaurant names as proxy for relevance
    if (query.tags) {
      query.tags.forEach(tag => {
        if (itemName.includes(tag.toLowerCase())) {
          matchScore += 0.5;
        }
      });
    }

    return Math.min(matchScore, 1.0);
  }

  private calculatePriceRelevance(result: TSearchResult, query: TStructuredQuery): number {
    if (!query.priceRange) return 0.5; // Neutral score if no price preference

    const { min, max } = query.priceRange;
    const price = result.price;
    const range = max - min;
    const center = (min + max) / 2;

    if (price >= min && price <= max) {
      // Perfect match within range - score higher if closer to center
      const distanceFromCenter = Math.abs(price - center) / (range / 2);
      return 1.0 - (distanceFromCenter * 0.2); // Max penalty of 20% for being at edges
    } else if (price < min) {
      // Below minimum - score based on distance from min
      const distance = (min - price) / min;
      return Math.max(0, 1 - distance);
    } else {
      // Above maximum - less penalty for being above range (better value perception)
      const distance = (price - max) / max;
      return Math.max(0, 1 - distance * 0.7);
    }
  }

  private calculateUserPreference(result: TSearchResult, userHistory?: TSearchHistoryItem[]): number {
    if (!userHistory || userHistory.length === 0) return 0.5; // Neutral score

    let preferenceScore = 0;
    let totalWeight = 0;

    userHistory.forEach((historyItem, index) => {
      const recencyWeight = this.calculateRecencyWeight(index, userHistory.length);
      totalWeight += recencyWeight;

      // Restaurant preference
      const restaurantScore = this.calculateRestaurantPreference(result, historyItem, recencyWeight);
      preferenceScore += restaurantScore;

      // Tag/category preference
      const tagScore = this.calculateTagPreference(result, historyItem, recencyWeight);
      preferenceScore += tagScore;

      // Price preference
      const priceScore = this.calculatePricePreference(result, historyItem, recencyWeight);
      preferenceScore += priceScore;
    });

    return totalWeight > 0 ? Math.min(preferenceScore / totalWeight, 1.0) : 0.5;
  }

  private calculateRecencyWeight(index: number, totalItems: number): number {
    // More recent items get higher weight (exponential decay)
    const position = totalItems - index;
    return Math.pow(0.8, index) * (position / totalItems);
  }

  private calculateRestaurantPreference(
    result: TSearchResult,
    historyItem: TSearchHistoryItem,
    recencyWeight: number,
  ): number {
    const restaurantMatch = historyItem.results.some(prevResult =>
      prevResult.restaurant.id === result.restaurant.id,
    );

    return restaurantMatch ? 0.4 * recencyWeight : 0;
  }

  private calculateTagPreference(
    result: TSearchResult,
    historyItem: TSearchHistoryItem,
    recencyWeight: number,
  ): number {
    if (!historyItem.structuredQuery.tags || historyItem.structuredQuery.tags.length === 0) {
      return 0;
    }

    const tagMatches = result.tags.filter(tag =>
      historyItem.structuredQuery.tags!.some(historyTag =>
        tag.toLowerCase().includes(historyTag.toLowerCase()),
      ),
    );

    if (tagMatches.length === 0) return 0;

    const matchRatio = tagMatches.length / Math.max(result.tags.length, historyItem.structuredQuery.tags.length);
    return 0.4 * matchRatio * recencyWeight;
  }

  private calculatePricePreference(
    result: TSearchResult,
    historyItem: TSearchHistoryItem,
    recencyWeight: number,
  ): number {
    const historyPrices = historyItem.results.map(r => r.price);
    if (historyPrices.length === 0) return 0;

    const avgHistoryPrice = historyPrices.reduce((a, b) => a + b, 0) / historyPrices.length;
    const priceDifference = Math.abs(result.price - avgHistoryPrice) / avgHistoryPrice;

    // Closer to historical average = higher score
    const similarity = Math.max(0, 1 - priceDifference);
    return 0.2 * similarity * recencyWeight;
  }

  private calculateBoosts(
    result: TSearchResult,
    query: TStructuredQuery,
    userHistory?: TSearchHistoryItem[],
  ): number {
    let totalBoost = 0;

    // Exact name match boost
    if (query.tags) {
      const exactNameMatch = query.tags.some(tag =>
        result.name.toLowerCase().includes(tag.toLowerCase()),
      );
      if (exactNameMatch) {
        totalBoost += this.config.boosts.exactNameMatch;
      }
    }

    // Exact restaurant match boost
    if (query.restaurants) {
      const exactRestaurantMatch = query.restaurants.some(restaurant =>
        result.restaurant.name.toLowerCase().includes(restaurant.toLowerCase()),
      );
      if (exactRestaurantMatch) {
        totalBoost += this.config.boosts.exactRestaurantMatch;
      }
    }

    // Price range center boost
    if (query.priceRange) {
      const center = (query.priceRange.min + query.priceRange.max) / 2;
      const range = query.priceRange.max - query.priceRange.min;
      const distanceFromCenter = Math.abs(result.price - center);

      if (distanceFromCenter <= range * 0.1) { // Within 10% of center
        totalBoost += this.config.boosts.priceRangeCenter;
      }
    }

    // Recent user preference boost
    if (userHistory && userHistory.length > 0) {
      const recentHistory = userHistory.slice(0, 3); // Last 3 searches
      const hasRecentPreference = recentHistory.some(item =>
        item.results.some(prevResult =>
          prevResult.restaurant.id === result.restaurant.id,
        ),
      );

      if (hasRecentPreference) {
        totalBoost += this.config.boosts.recentUserPreference;
      }
    }

    return totalBoost;
  }

  private calculatePenalties(result: TSearchResult, query: TStructuredQuery): number {
    let totalPenalty = 0;

    // Price out of range penalty
    if (query.priceRange) {
      const { min, max } = query.priceRange;
      if (result.price < min || result.price > max) {
        const centerDistance = Math.abs(result.price - (min + max) / 2);
        const maxDistance = Math.max(min, max);
        totalPenalty += this.config.penalties.priceOutOfRange * (centerDistance / maxDistance);
      }
    }

    // No tag match penalty
    if (query.tags && query.tags.length > 0) {
      const hasAnyTagMatch = query.tags.some(tag =>
        result.tags.some(resultTag =>
          resultTag.toLowerCase().includes(tag.toLowerCase()),
        )
        || result.name.toLowerCase().includes(tag.toLowerCase())
        || result.description.toLowerCase().includes(tag.toLowerCase()),
      );

      if (!hasAnyTagMatch) {
        totalPenalty += this.config.penalties.noTagMatch;
      }
    }

    // Excluded content penalty
    if (query.exclusions) {
      // Check excluded restaurants
      if (query.exclusions.restaurants?.some(excludedRestaurant =>
        result.restaurant.name.toLowerCase().includes(excludedRestaurant.toLowerCase()),
      )) {
        totalPenalty += this.config.penalties.excludedContent;
      }

      // Check excluded tags
      if (query.exclusions.tags?.some(excludedTag =>
        result.tags.some(tag => tag.toLowerCase().includes(excludedTag.toLowerCase()))
        || result.name.toLowerCase().includes(excludedTag.toLowerCase())
        || result.description.toLowerCase().includes(excludedTag.toLowerCase()),
      )) {
        totalPenalty += this.config.penalties.excludedContent;
      }
    }

    return totalPenalty;
  }
}
