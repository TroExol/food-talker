import { v4 as uuidv4 } from 'uuid';

import type { TDatabaseConnection } from '@/services/database/types';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';
import {
  EApiRequestType,
  type TApiRequestLog,
  type TApiRequestLogEntity,
  type TApiRequestStats,
  type TCreateApiRequestLog,
} from '@/types/apiRequestLogging';

export class ApiRequestLoggingService {
  constructor(private readonly db: TDatabaseConnection) {}

  public logRequest = async (logData: TCreateApiRequestLog): Promise<TApiRequestLog> => {
    try {
      const id = uuidv4();
      const timestamp = new Date();

      await this.db.run(`
        INSERT INTO api_request_logs (
          id, user_telegram_id, request_type, endpoint, method, status_code,
          request_data, response_data, processing_time_ms, error_message, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        id,
        logData.userTelegramId || null,
        logData.requestType,
        logData.endpoint,
        logData.method,
        logData.statusCode,
        logData.requestData ? JSON.stringify(logData.requestData) : null,
        logData.responseData ? JSON.stringify(logData.responseData) : null,
        logData.processingTimeMs,
        logData.errorMessage || null,
        timestamp.toISOString(),
      ]);

      const apiRequestLog: TApiRequestLog = {
        id,
        userTelegramId: logData.userTelegramId || null,
        requestType: logData.requestType,
        endpoint: logData.endpoint,
        method: logData.method,
        statusCode: logData.statusCode,
        requestData: logData.requestData || null,
        responseData: logData.responseData || null,
        processingTimeMs: logData.processingTimeMs,
        errorMessage: logData.errorMessage || null,
        createdAt: timestamp,
      };

      ConsoleLogger.debug('API запрос залогирован', {
        userId: logData.userTelegramId || 'system',
        requestType: logData.requestType,
        endpoint: logData.endpoint,
        statusCode: logData.statusCode,
        processingTimeMs: logData.processingTimeMs,
      });

      return apiRequestLog;
    } catch (error) {
      ConsoleLogger.error('Ошибка логирования API запроса', error as Error, { logData });
      throw AppError.databaseError('API_REQUEST_LOG_FAILED', 'Не удалось залогировать API запрос');
    }
  };

  public getUserApiStats = async (userTelegramId: number, days = 30): Promise<TApiRequestStats> => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const entities = await this.db.query<TApiRequestLogEntity>(`
        SELECT * FROM api_request_logs
        WHERE user_telegram_id = $1 AND created_at >= $2
        ORDER BY created_at DESC
      `, [userTelegramId, cutoffDate.toISOString()]);

      const logs = entities.map(entity => this.entityToApiRequestLog(entity));

      return this.calculateApiStats(logs);
    } catch (error) {
      ConsoleLogger.error('Ошибка получения статистики API запросов пользователя', error as Error, { userTelegramId });
      throw AppError.databaseError('API_STATS_GET_FAILED', 'Не удалось получить статистику API запросов');
    }
  };

  public getApiStatsByType = async (
    userTelegramId: number,
    requestType: EApiRequestType,
    days = 30,
  ): Promise<TApiRequestStats> => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const entities = await this.db.query<TApiRequestLogEntity>(`
        SELECT * FROM api_request_logs
        WHERE user_telegram_id = $1 AND request_type = $2 AND created_at >= $3
        ORDER BY created_at DESC
      `, [userTelegramId, requestType, cutoffDate.toISOString()]);

      const logs = entities.map(entity => this.entityToApiRequestLog(entity));

      return this.calculateApiStats(logs);
    } catch (error) {
      ConsoleLogger.error('Ошибка получения статистики API запросов по типу', error as Error, { userTelegramId, requestType });
      throw AppError.databaseError('API_STATS_BY_TYPE_GET_FAILED', 'Не удалось получить статистику API запросов по типу');
    }
  };

  public getRecentApiLogs = async (userTelegramId: number, limit = 10): Promise<TApiRequestLog[]> => {
    try {
      const entities = await this.db.query<TApiRequestLogEntity>(`
        SELECT * FROM api_request_logs
        WHERE user_telegram_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [userTelegramId, limit]);

      return entities.map(entity => this.entityToApiRequestLog(entity));
    } catch (error) {
      ConsoleLogger.error('Ошибка получения последних API логов', error as Error, { userTelegramId });
      throw AppError.databaseError('RECENT_API_LOGS_GET_FAILED', 'Не удалось получить последние API логи');
    }
  };

  public getFailedRequests = async (userTelegramId: number, days = 30): Promise<TApiRequestLog[]> => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const entities = await this.db.query<TApiRequestLogEntity>(`
        SELECT * FROM api_request_logs
        WHERE user_telegram_id = $1 AND status_code >= 400 AND created_at >= $2
        ORDER BY created_at DESC
      `, [userTelegramId, cutoffDate.toISOString()]);

      return entities.map(entity => this.entityToApiRequestLog(entity));
    } catch (error) {
      ConsoleLogger.error('Ошибка получения неудачных API запросов', error as Error, { userTelegramId });
      throw AppError.databaseError('FAILED_API_REQUESTS_GET_FAILED', 'Не удалось получить неудачные API запросы');
    }
  };

  private entityToApiRequestLog = (entity: TApiRequestLogEntity): TApiRequestLog => {
    return {
      id: entity.id,
      userTelegramId: entity.user_telegram_id,
      requestType: entity.request_type as EApiRequestType,
      endpoint: entity.endpoint,
      method: entity.method,
      statusCode: entity.status_code,
      requestData: entity.request_data,
      responseData: entity.response_data,
      processingTimeMs: entity.processing_time_ms,
      errorMessage: entity.error_message,
      createdAt: new Date(entity.created_at),
    };
  };

  private calculateApiStats = (logs: TApiRequestLog[]): TApiRequestStats => {
    const totalRequests = logs.length;
    const successfulRequests = logs.filter(log => log.statusCode < 400).length;
    const failedRequests = totalRequests - successfulRequests;
    const totalResponseTime = logs.reduce((sum, log) => sum + log.processingTimeMs, 0);
    const averageResponseTimeMs = totalRequests > 0 ? Math.round(totalResponseTime / totalRequests) : 0;

    const requestsByType: Record<EApiRequestType, {
      count: number;
      successCount: number;
      failureCount: number;
      averageResponseTimeMs: number;
    }> = {
      [EApiRequestType.YANDEX_EDA_RESTAURANTS]: {
        count: 0,
        successCount: 0,
        failureCount: 0,
        averageResponseTimeMs: 0,
      },
      [EApiRequestType.YANDEX_EDA_MENU]: {
        count: 0,
        successCount: 0,
        failureCount: 0,
        averageResponseTimeMs: 0,
      },
      [EApiRequestType.YANDEX_EDA_PLACE]: {
        count: 0,
        successCount: 0,
        failureCount: 0,
        averageResponseTimeMs: 0,
      },
    };

    const requestsByEndpoint: Record<string, {
      count: number;
      successCount: number;
      failureCount: number;
      averageResponseTimeMs: number;
    }> = {};

    logs.forEach(log => {
      // Статистика по типу
      const typeStats = requestsByType[log.requestType];
      typeStats.count++;
      if (log.statusCode < 400) {
        typeStats.successCount++;
      } else {
        typeStats.failureCount++;
      }

      // Статистика по эндпоинту
      if (!requestsByEndpoint[log.endpoint]) {
        requestsByEndpoint[log.endpoint] = { count: 0, successCount: 0, failureCount: 0, averageResponseTimeMs: 0 };
      }
      const endpointStats = requestsByEndpoint[log.endpoint];
      endpointStats.count++;
      if (log.statusCode < 400) {
        endpointStats.successCount++;
      } else {
        endpointStats.failureCount++;
      }
    });

    // Вычисляем средние значения
    Object.entries(requestsByType).forEach(([type, stats]) => {
      if (stats.count > 0) {
        const typeLogs = logs.filter(log => log.requestType === type as EApiRequestType);
        const totalTime = typeLogs.reduce((sum, log) => sum + log.processingTimeMs, 0);
        stats.averageResponseTimeMs = Math.round(totalTime / stats.count);
      }
    });

    Object.entries(requestsByEndpoint).forEach(([endpoint, stats]) => {
      if (stats.count > 0) {
        const endpointLogs = logs.filter(log => log.endpoint === endpoint);
        const totalTime = endpointLogs.reduce((sum, log) => sum + log.processingTimeMs, 0);
        stats.averageResponseTimeMs = Math.round(totalTime / stats.count);
      }
    });

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTimeMs,
      requestsByType,
      requestsByEndpoint,
    };
  };
}
