import { environment } from '@/config/environment';

import type { TelemetreeConfig } from './types';

import { TelemetreeService } from './TelemetreeService';

export class TelemetreeServiceFactory {
  private static instance: TelemetreeService | null = null;

  static getInstance = (): TelemetreeService => {
    if (!TelemetreeServiceFactory.instance) {
      const config: TelemetreeConfig = {
        projectId: environment.TELEMETREE_PROJECT_ID || '',
        apiKey: environment.TELEMETREE_API_KEY || '',
        timeoutMs: 10000,
        retryAttempts: 3,
        retryDelayMs: 1000,
        batchSize: 10,
        flushIntervalMs: 5000,
      };

      TelemetreeServiceFactory.instance = new TelemetreeService(config);
    }
    return TelemetreeServiceFactory.instance;
  };

  static destroyInstance = async (): Promise<void> => {
    if (TelemetreeServiceFactory.instance) {
      await TelemetreeServiceFactory.instance.destroy();
      TelemetreeServiceFactory.instance = null;
    }
  };
}
