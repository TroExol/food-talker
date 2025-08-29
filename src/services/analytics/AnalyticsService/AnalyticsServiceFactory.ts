import { botConfig } from '@/config/bot';

import type { TAnalyticsConfig } from './types';

import { AnalyticsService } from './AnalyticsService';
import { YandexMetricaServiceFactory } from '../YandexMetricaService/YandexMetricaServiceFactory';

export class AnalyticsServiceFactory {
  private static instance: AnalyticsService | null = null;

  static getInstance = (): AnalyticsService => {
    if (!AnalyticsServiceFactory.instance) {
      const config: TAnalyticsConfig = {
        enabled: botConfig.analyticsEnabled,
        batchSize: 10,
        flushIntervalMs: 5000,
        retryAttempts: 3,
        retryDelayMs: 1000,
      };

      AnalyticsServiceFactory.instance = new AnalyticsService(
        YandexMetricaServiceFactory.getInstance(),
        config,
      );
    }
    return AnalyticsServiceFactory.instance;
  };
}
