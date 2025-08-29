import { environment } from '@/config/environment';

import type { YandexMetricaConfig } from './types';

import { YandexMetricaService } from './YandexMetricaService';

export class YandexMetricaServiceFactory {
  private static instance: YandexMetricaService | null = null;

  static getInstance(): YandexMetricaService {
    if (!YandexMetricaServiceFactory.instance) {
      const config: YandexMetricaConfig = {
        counterId: environment.YANDEX_METRIKA_COUNTER_ID || '',
        endpoint: 'https://mc.yandex.ru/collect/',
        timeoutMs: 10000,
        retryAttempts: 3,
        retryDelayMs: 1000,
      };

      YandexMetricaServiceFactory.instance = new YandexMetricaService(config);
    }
    return YandexMetricaServiceFactory.instance;
  }
}
