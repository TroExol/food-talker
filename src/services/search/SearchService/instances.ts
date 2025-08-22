import { UserServiceFactory } from '@/services/user/UserServiceFactory';
import { llmService } from '@/services/search/LLMService/instances';
import { cachedYeService } from '@/services/data/yandexEda/cachedYEService/instances';
import { redisCacheService } from '@/services/data/cache/cacheService/instances';

import { SearchService } from './SearchService';

export const searchService = new SearchService(
  llmService,
  UserServiceFactory.getInstance(),
  cachedYeService,
  redisCacheService,
  {
    maxResults: 30,
    cacheTTL: {
      searchResults: 1800, // 30 minutes
      queryTransformations: 3600, // 1 hour
      ranking: 900, // 15 minutes
      analytics: 7200, // 2 hours
      userPreferences: 86400, // 24 hours
    },
    ranking: {
      queryMatchWeight: 0.4,
      priceRelevanceWeight: 0.25,
      userPreferenceWeight: 0.35,
    },
    filtering: {
      enableFuzzyMatching: true,
      strictExclusions: true,
      priceTolerancePercent: 10,
      minimumMatchScore: 0.1,
    },
    analytics: {
      historyRetentionDays: 90,
      minFrequencyThreshold: 2,
    },
  },
);
