import { v4 as uuidv4 } from 'uuid';

import type { TDatabaseConnection } from '@/services/database/types';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';
import {
  ENeuralRequestType,
  type TCreateNeuralRequestLog,
  type TNeuralRequestLog,
  type TNeuralRequestLogEntity,
  type TTokenUsageStats,
} from '@/types/neuralRequestLogging';

export class NeuralRequestLoggingService {
  constructor(private readonly db: TDatabaseConnection) {}

  public logRequest = async (logData: TCreateNeuralRequestLog): Promise<TNeuralRequestLog> => {
    try {
      const id = uuidv4();
      const timestamp = new Date();

      await this.db.run(`
        INSERT INTO neural_request_logs (
          id, user_telegram_id, request_type, model, input_tokens, output_tokens, total_tokens,
          request_data, response_data, processing_time_ms, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        id,
        logData.userTelegramId || null,
        logData.requestType,
        logData.model,
        logData.inputTokens,
        logData.outputTokens,
        logData.totalTokens,
        logData.requestData ? JSON.stringify(logData.requestData) : null,
        logData.responseData ? JSON.stringify(logData.responseData) : null,
        logData.processingTimeMs,
        timestamp.toISOString(),
      ]);

      const neuralRequestLog: TNeuralRequestLog = {
        id,
        userTelegramId: logData.userTelegramId || null,
        requestType: logData.requestType,
        model: logData.model,
        inputTokens: logData.inputTokens,
        outputTokens: logData.outputTokens,
        totalTokens: logData.totalTokens,
        requestData: logData.requestData || null,
        responseData: logData.responseData || null,
        processingTimeMs: logData.processingTimeMs,
        createdAt: timestamp,
      };

      ConsoleLogger.debug('Запрос к нейронной модели залогирован', {
        userId: logData.userTelegramId || 'system',
        requestType: logData.requestType,
        model: logData.model,
        totalTokens: logData.totalTokens,
      });

      return neuralRequestLog;
    } catch (error) {
      ConsoleLogger.error('Ошибка логирования запроса к нейронной модели', error as Error, { logData });
      throw AppError.databaseError('NEURAL_REQUEST_LOG_FAILED', 'Не удалось залогировать запрос к нейронной модели');
    }
  };

  public getUserTokenStats = async (userTelegramId: string, days = 30): Promise<TTokenUsageStats> => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const entities = await this.db.query<TNeuralRequestLogEntity>(`
        SELECT * FROM neural_request_logs
        WHERE user_telegram_id = $1 AND created_at >= $2
        ORDER BY created_at DESC
      `, [userTelegramId, cutoffDate.toISOString()]);

      const logs = entities.map(entity => this.entityToNeuralRequestLog(entity));

      return this.calculateTokenStats(logs);
    } catch (error) {
      ConsoleLogger.error('Ошибка получения статистики токенов пользователя', error as Error, { userTelegramId });
      throw AppError.databaseError('TOKEN_STATS_GET_FAILED', 'Не удалось получить статистику токенов');
    }
  };

  public getUserTokenStatsByType = async (
    userTelegramId: string,
    requestType: ENeuralRequestType,
    days = 30,
  ): Promise<TTokenUsageStats> => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const entities = await this.db.query<TNeuralRequestLogEntity>(`
        SELECT * FROM neural_request_logs
        WHERE user_telegram_id = $1 AND request_type = $2 AND created_at >= $3
        ORDER BY created_at DESC
      `, [userTelegramId, requestType, cutoffDate.toISOString()]);

      const logs = entities.map(entity => this.entityToNeuralRequestLog(entity));

      return this.calculateTokenStats(logs);
    } catch (error) {
      ConsoleLogger.error('Ошибка получения статистики токенов по типу', error as Error, { userTelegramId, requestType });
      throw AppError.databaseError('TOKEN_STATS_BY_TYPE_GET_FAILED', 'Не удалось получить статистику токенов по типу');
    }
  };

  public getRecentLogs = async (userTelegramId: string, limit = 10): Promise<TNeuralRequestLog[]> => {
    try {
      const entities = await this.db.query<TNeuralRequestLogEntity>(`
        SELECT * FROM neural_request_logs
        WHERE user_telegram_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [userTelegramId, limit]);

      return entities.map(entity => this.entityToNeuralRequestLog(entity));
    } catch (error) {
      ConsoleLogger.error('Ошибка получения последних логов', error as Error, { userTelegramId });
      throw AppError.databaseError('RECENT_LOGS_GET_FAILED', 'Не удалось получить последние логи');
    }
  };

  private entityToNeuralRequestLog = (entity: TNeuralRequestLogEntity): TNeuralRequestLog => {
    return {
      id: entity.id,
      userTelegramId: entity.user_telegram_id,
      requestType: entity.request_type as ENeuralRequestType,
      model: entity.model,
      inputTokens: entity.input_tokens,
      outputTokens: entity.output_tokens,
      totalTokens: entity.total_tokens,
      requestData: entity.request_data,
      responseData: entity.response_data,
      processingTimeMs: entity.processing_time_ms,
      createdAt: new Date(entity.created_at),
    };
  };

  private calculateTokenStats = (logs: TNeuralRequestLog[]): TTokenUsageStats => {
    const totalTokens = logs.reduce((sum, log) => sum + log.totalTokens, 0);
    const inputTokens = logs.reduce((sum, log) => sum + log.inputTokens, 0);
    const outputTokens = logs.reduce((sum, log) => sum + log.outputTokens, 0);
    const requestCount = logs.length;

    const requestsByType: Record<ENeuralRequestType, {
      count: number;
      totalTokens: number;
      averageTokens: number;
    }> = {
      [ENeuralRequestType.LLM_STRUCTURE_QUERY]: { count: 0, totalTokens: 0, averageTokens: 0 },
      [ENeuralRequestType.LLM_ENHANCE_RESULTS]: { count: 0, totalTokens: 0, averageTokens: 0 },
      [ENeuralRequestType.LLM_CATEGORIZE_DISHES]: { count: 0, totalTokens: 0, averageTokens: 0 },
      [ENeuralRequestType.EMBEDDING]: { count: 0, totalTokens: 0, averageTokens: 0 },
    };

    logs.forEach(log => {
      const typeStats = requestsByType[log.requestType];
      typeStats.count++;
      typeStats.totalTokens += log.totalTokens;
    });

    // Вычисляем средние значения
    Object.values(requestsByType).forEach(stats => {
      stats.averageTokens = stats.count > 0 ? Math.round(stats.totalTokens / stats.count) : 0;
    });

    return {
      totalTokens,
      inputTokens,
      outputTokens,
      requestCount,
      averageTokensPerRequest: requestCount > 0 ? Math.round(totalTokens / requestCount) : 0,
      requestsByType,
    };
  };
}
