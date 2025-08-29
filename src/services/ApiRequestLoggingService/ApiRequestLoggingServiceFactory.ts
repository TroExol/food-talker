import { PostgreSQLFactory } from '@/services/database/PostgreSQL/PostgreSQLFactory';

import { ApiRequestLoggingService } from './ApiRequestLoggingService';

export class ApiRequestLoggingServiceFactory {
  private static instance: ApiRequestLoggingService | null = null;

  static getInstance = async (): Promise<ApiRequestLoggingService> => {
    if (!ApiRequestLoggingServiceFactory.instance) {
      ApiRequestLoggingServiceFactory.instance = new ApiRequestLoggingService(
        await PostgreSQLFactory.getInstance(),
      );
    }
    return ApiRequestLoggingServiceFactory.instance;
  };

  static resetInstance = (): void => {
    ApiRequestLoggingServiceFactory.instance = null;
  };
}
