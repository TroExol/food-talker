import type { EAvailableCities } from '@/config/bot';
import type { TSearchResult, TStructuredQuery } from '@/models/search';
import type { TMenuItem } from '@/models/yandexEda';

import { logger } from '@/utils/logger';

export interface TFilterConfig {
  enableFuzzyMatching: boolean;
  strictExclusions: boolean;
  priceTolerancePercent: number;
  minimumMatchScore: number;
}

export interface TFilterStats {
  totalFiltered: number;
  byRestaurant: number;
  byTags: number;
  byPrice: number;
  byExclusions: number;
  byBusinessLogic: number;
}

export class SearchFilterEngine {
  private readonly config: TFilterConfig;

  constructor(config?: Partial<TFilterConfig>) {
    this.config = {
      enableFuzzyMatching: config?.enableFuzzyMatching ?? true,
      strictExclusions: config?.strictExclusions ?? true,
      priceTolerancePercent: config?.priceTolerancePercent ?? 10,
      minimumMatchScore: config?.minimumMatchScore ?? 0.1,
    };
  }

  public applyFilters(
    items: TMenuItem[],
    query: TStructuredQuery,
    city: EAvailableCities
  ): { filteredItems: TMenuItem[]; stats: TFilterStats } {
    const stats: TFilterStats = {
      totalFiltered: 0,
      byRestaurant: 0,
      byTags: 0,
      byPrice: 0,
      byExclusions: 0,
      byBusinessLogic: 0,
    };

    const initialCount = items.length;
    
    let filteredItems = items
      .filter(item => this.applyBusinessLogicFilter(item, city, stats))
      .filter(item => this.applyRestaurantFilter(item, query, stats))
      .filter(item => this.applyTagFilter(item, query, stats))
      .filter(item => this.applyPriceFilter(item, query, stats))
      .filter(item => this.applyExclusionFilters(item, query, stats));

    stats.totalFiltered = initialCount - filteredItems.length;

    logger.debug('Фильтрация завершена', {
      initialCount,
      finalCount: filteredItems.length,
      stats
    });

    return { filteredItems, stats };
  }

  public applySearchResultFilters(
    results: TSearchResult[],
    query: TStructuredQuery,
    city: EAvailableCities
  ): { filteredResults: TSearchResult[]; stats: TFilterStats } {
    const stats: TFilterStats = {
      totalFiltered: 0,
      byRestaurant: 0,
      byTags: 0,
      byPrice: 0,
      byExclusions: 0,
      byBusinessLogic: 0,
    };

    const initialCount = results.length;
    
    let filteredResults = results
      .filter(result => this.applySearchResultBusinessLogicFilter(result, city, stats))
      .filter(result => this.applySearchResultRestaurantFilter(result, query, stats))
      .filter(result => this.applySearchResultTagFilter(result, query, stats))
      .filter(result => this.applySearchResultPriceFilter(result, query, stats))
      .filter(result => this.applySearchResultExclusionFilters(result, query, stats));

    stats.totalFiltered = initialCount - filteredResults.length;

    return { filteredResults, stats };
  }

  // MenuItem filtering methods

  private applyBusinessLogicFilter(item: TMenuItem, city: EAvailableCities, stats: TFilterStats): boolean {
    // Basic business logic filters
    if (!item.id || !item.name || !item.restaurant) {
      stats.byBusinessLogic++;
      return false;
    }

    // Check if item is actually available
    if (!item.available) {
      stats.byBusinessLogic++;
      return false;
    }

    // Price validation
    if (item.price <= 0) {
      stats.byBusinessLogic++;
      return false;
    }

    // Restaurant must be active
    if (!item.restaurant.isActive) {
      stats.byBusinessLogic++;
      return false;
    }

    return true;
  }

  private applyRestaurantFilter(item: TMenuItem, query: TStructuredQuery, stats: TFilterStats): boolean {
    if (!query.restaurants || query.restaurants.length === 0) {
      return true; // No restaurant filter specified
    }

    const restaurantMatch = query.restaurants.some(restaurant => {
      const restaurantName = item.restaurant.name.toLowerCase();
      const queryRestaurant = restaurant.toLowerCase();
      
      // Exact match
      if (restaurantName === queryRestaurant) {
        return true;
      }
      
      // Fuzzy matching if enabled
      if (this.config.enableFuzzyMatching) {
        return restaurantName.includes(queryRestaurant) || 
               queryRestaurant.includes(restaurantName);
      }
      
      return false;
    });

    if (!restaurantMatch) {
      stats.byRestaurant++;
      return false;
    }

    return true;
  }

  private applyTagFilter(item: TMenuItem, query: TStructuredQuery, stats: TFilterStats): boolean {
    if (!query.tags || query.tags.length === 0) {
      return true; // No tag filter specified
    }

    const searchableText = [
      item.name.toLowerCase(),
      item.description.toLowerCase(),
      ...item.ingredients.map(ing => ing.toLowerCase())
    ].join(' ');

    const hasMatchingTag = query.tags.some(tag => {
      const queryTag = tag.toLowerCase();
      
      if (this.config.enableFuzzyMatching) {
        // Fuzzy matching in any searchable text
        return searchableText.includes(queryTag) ||
               item.ingredients.some(ing => ing.toLowerCase().includes(queryTag)) ||
               item.name.toLowerCase().includes(queryTag) ||
               item.description.toLowerCase().includes(queryTag);
      } else {
        // Strict matching
        return item.ingredients.some(ing => ing.toLowerCase() === queryTag) ||
               item.name.toLowerCase().includes(queryTag);
      }
    });

    if (!hasMatchingTag) {
      stats.byTags++;
      return false;
    }

    return true;
  }

  private applyPriceFilter(item: TMenuItem, query: TStructuredQuery, stats: TFilterStats): boolean {
    if (!query.priceRange) {
      return true; // No price filter specified
    }

    const { min, max } = query.priceRange;
    const tolerance = this.config.priceTolerancePercent / 100;
    
    // Apply tolerance to price range
    const tolerantMin = min * (1 - tolerance);
    const tolerantMax = max * (1 + tolerance);

    if (item.price < tolerantMin || item.price > tolerantMax) {
      stats.byPrice++;
      return false;
    }

    return true;
  }

  private applyExclusionFilters(item: TMenuItem, query: TStructuredQuery, stats: TFilterStats): boolean {
    if (!query.exclusions) {
      return true; // No exclusions specified
    }

    // Check excluded restaurants
    if (query.exclusions.restaurants?.length) {
      const isExcludedRestaurant = query.exclusions.restaurants.some(excludedRestaurant => {
        const restaurantName = item.restaurant.name.toLowerCase();
        const excluded = excludedRestaurant.toLowerCase();
        
        if (this.config.strictExclusions) {
          return restaurantName.includes(excluded);
        } else {
          return restaurantName === excluded;
        }
      });

      if (isExcludedRestaurant) {
        stats.byExclusions++;
        return false;
      }
    }

    // Check excluded tags/ingredients
    if (query.exclusions.tags?.length) {
      const searchableText = [
        item.name.toLowerCase(),
        item.description.toLowerCase(),
        ...item.ingredients.map(ing => ing.toLowerCase())
      ].join(' ');

      const hasExcludedTag = query.exclusions.tags.some(excludedTag => {
        const excluded = excludedTag.toLowerCase();
        
        if (this.config.strictExclusions) {
          return searchableText.includes(excluded) ||
                 item.ingredients.some(ing => ing.toLowerCase().includes(excluded));
        } else {
          return item.ingredients.some(ing => ing.toLowerCase() === excluded);
        }
      });

      if (hasExcludedTag) {
        stats.byExclusions++;
        return false;
      }
    }

    // Check excluded price range
    if (query.exclusions.priceRange) {
      const { min, max } = query.exclusions.priceRange;
      if (item.price >= min && item.price <= max) {
        stats.byExclusions++;
        return false;
      }
    }

    return true;
  }

  // SearchResult filtering methods (for already converted results)

  private applySearchResultBusinessLogicFilter(
    result: TSearchResult, 
    city: EAvailableCities, 
    stats: TFilterStats
  ): boolean {
    // Basic validation
    if (!result.id || !result.name || !result.restaurant || !result.orderUrl) {
      stats.byBusinessLogic++;
      return false;
    }

    // Price validation
    if (result.price <= 0) {
      stats.byBusinessLogic++;
      return false;
    }

    return true;
  }

  private applySearchResultRestaurantFilter(
    result: TSearchResult, 
    query: TStructuredQuery, 
    stats: TFilterStats
  ): boolean {
    if (!query.restaurants || query.restaurants.length === 0) {
      return true;
    }

    const restaurantMatch = query.restaurants.some(restaurant => {
      const restaurantName = result.restaurant.name.toLowerCase();
      const queryRestaurant = restaurant.toLowerCase();
      
      if (this.config.enableFuzzyMatching) {
        return restaurantName.includes(queryRestaurant) || 
               queryRestaurant.includes(restaurantName);
      } else {
        return restaurantName === queryRestaurant;
      }
    });

    if (!restaurantMatch) {
      stats.byRestaurant++;
      return false;
    }

    return true;
  }

  private applySearchResultTagFilter(
    result: TSearchResult, 
    query: TStructuredQuery, 
    stats: TFilterStats
  ): boolean {
    if (!query.tags || query.tags.length === 0) {
      return true;
    }

    const searchableText = [
      result.name.toLowerCase(),
      result.description.toLowerCase(),
      ...result.tags.map(tag => tag.toLowerCase())
    ].join(' ');

    const hasMatchingTag = query.tags.some(tag => {
      const queryTag = tag.toLowerCase();
      
      if (this.config.enableFuzzyMatching) {
        return searchableText.includes(queryTag) ||
               result.tags.some(resultTag => resultTag.toLowerCase().includes(queryTag));
      } else {
        return result.tags.some(resultTag => resultTag.toLowerCase() === queryTag);
      }
    });

    if (!hasMatchingTag) {
      stats.byTags++;
      return false;
    }

    return true;
  }

  private applySearchResultPriceFilter(
    result: TSearchResult, 
    query: TStructuredQuery, 
    stats: TFilterStats
  ): boolean {
    if (!query.priceRange) {
      return true;
    }

    const { min, max } = query.priceRange;
    const tolerance = this.config.priceTolerancePercent / 100;
    
    const tolerantMin = min * (1 - tolerance);
    const tolerantMax = max * (1 + tolerance);

    if (result.price < tolerantMin || result.price > tolerantMax) {
      stats.byPrice++;
      return false;
    }

    return true;
  }

  private applySearchResultExclusionFilters(
    result: TSearchResult, 
    query: TStructuredQuery, 
    stats: TFilterStats
  ): boolean {
    if (!query.exclusions) {
      return true;
    }

    // Check excluded restaurants
    if (query.exclusions.restaurants?.length) {
      const isExcludedRestaurant = query.exclusions.restaurants.some(excludedRestaurant => {
        const restaurantName = result.restaurant.name.toLowerCase();
        const excluded = excludedRestaurant.toLowerCase();
        
        if (this.config.strictExclusions) {
          return restaurantName.includes(excluded);
        } else {
          return restaurantName === excluded;
        }
      });

      if (isExcludedRestaurant) {
        stats.byExclusions++;
        return false;
      }
    }

    // Check excluded tags
    if (query.exclusions.tags?.length) {
      const searchableText = [
        result.name.toLowerCase(),
        result.description.toLowerCase(),
        ...result.tags.map(tag => tag.toLowerCase())
      ].join(' ');

      const hasExcludedTag = query.exclusions.tags.some(excludedTag => {
        const excluded = excludedTag.toLowerCase();
        
        if (this.config.strictExclusions) {
          return searchableText.includes(excluded) ||
                 result.tags.some(tag => tag.toLowerCase().includes(excluded));
        } else {
          return result.tags.some(tag => tag.toLowerCase() === excluded);
        }
      });

      if (hasExcludedTag) {
        stats.byExclusions++;
        return false;
      }
    }

    // Check excluded price range
    if (query.exclusions.priceRange) {
      const { min, max } = query.exclusions.priceRange;
      if (result.price >= min && result.price <= max) {
        stats.byExclusions++;
        return false;
      }
    }

    return true;
  }

  // Utility methods

  public getFilteringStatistics(stats: TFilterStats): string {
    const total = stats.totalFiltered;
    if (total === 0) return 'Элементы не были отфильтрованы';

    const breakdown = [
      stats.byBusinessLogic > 0 ? `бизнес-логика: ${stats.byBusinessLogic}` : '',
      stats.byRestaurant > 0 ? `ресторан: ${stats.byRestaurant}` : '',
      stats.byTags > 0 ? `теги: ${stats.byTags}` : '',
      stats.byPrice > 0 ? `цена: ${stats.byPrice}` : '',
      stats.byExclusions > 0 ? `исключения: ${stats.byExclusions}` : '',
    ].filter(Boolean).join(', ');

    return `Отфильтровано ${total} элементов (${breakdown})`;
  }

  public validateFilters(query: TStructuredQuery): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate price range
    if (query.priceRange) {
      if (query.priceRange.min < 0) {
        errors.push('Минимальная цена не может быть отрицательной');
      }
      if (query.priceRange.max < query.priceRange.min) {
        errors.push('Максимальная цена не может быть меньше минимальной');
      }
      if (query.priceRange.max > 100000) {
        errors.push('Максимальная цена слишком высокая');
      }
    }

    // Validate exclusions
    if (query.exclusions?.priceRange) {
      if (query.exclusions.priceRange.min < 0) {
        errors.push('Минимальная цена исключения не может быть отрицательной');
      }
      if (query.exclusions.priceRange.max < query.exclusions.priceRange.min) {
        errors.push('Максимальная цена исключения не может быть меньше минимальной');
      }
    }

    // Validate arrays
    if (query.restaurants && !Array.isArray(query.restaurants)) {
      errors.push('Рестораны должны быть массивом');
    }
    if (query.tags && !Array.isArray(query.tags)) {
      errors.push('Теги должны быть массивом');
    }

    return { isValid: errors.length === 0, errors };
  }
}