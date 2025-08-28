import { PostgreSQLFactory } from '@/services/database/PostgreSQL/PostgreSQLFactory';

import { NeuralRequestLoggingService } from './NeuralRequestLoggingService';

export class NeuralRequestLoggingServiceFactory {
  private static instance: NeuralRequestLoggingService | null = null;

  static getInstance = async (): Promise<NeuralRequestLoggingService> => {
    if (!NeuralRequestLoggingServiceFactory.instance) {
      NeuralRequestLoggingServiceFactory.instance = new NeuralRequestLoggingService(
        await PostgreSQLFactory.getInstance(),
      );
    }
    return NeuralRequestLoggingServiceFactory.instance;
  };

  static resetInstance = (): void => {
    NeuralRequestLoggingServiceFactory.instance = null;
  };
}
