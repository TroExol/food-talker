import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TDatabaseConnection } from '@/services/database/types';

import { ENeuralRequestType } from '@/types/neuralRequestLogging';

import { NeuralRequestLoggingService } from './NeuralRequestLoggingService';

const mockRun = vi.fn();
const mockQuery = vi.fn();

describe('NeuralRequestLoggingService', () => {
  let service: NeuralRequestLoggingService;
  let mockDb: TDatabaseConnection;

  beforeEach(() => {
    mockDb = {
      run: mockRun,
      query: mockQuery,
    } as unknown as TDatabaseConnection;
    service = new NeuralRequestLoggingService(mockDb);
  });

  describe('logRequest', () => {
    it('должен успешно логировать LLM запрос', async () => {
      const logData = {
        userTelegramId: 123456789,
        requestType: ENeuralRequestType.LLM_STRUCTURE_QUERY,
        model: 'llama-3.1-8b',
        inputTokens: 120,
        outputTokens: 30,
        totalTokens: 150,
        requestData: {
          prompt: 'Структурируй запрос: хочу пиццу',
          temperature: 0.6,
        },
        responseData: {
          content: '{"tags": ["пицца"]}',
          reasoning: 'Анализирую запрос пользователя. Пользователь хочет пиццу, поэтому добавляю тег "пицца"',
          usage: { total_tokens: 150 },
        },
        processingTimeMs: 2500,
      };

      mockRun.mockResolvedValue(undefined);

      const result = await service.logRequest(logData);

      expect(result).toMatchObject({
        userTelegramId: 123456789,
        requestType: ENeuralRequestType.LLM_STRUCTURE_QUERY,
        model: 'llama-3.1-8b',
        inputTokens: 120,
        outputTokens: 30,
        totalTokens: 150,
        processingTimeMs: 2500,
      });

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO neural_request_logs'),
        expect.arrayContaining([
          expect.any(String), // id
          123456789,
          ENeuralRequestType.LLM_STRUCTURE_QUERY,
          'llama-3.1-8b',
          120,
          30,
          150,
          expect.any(String), // request_data JSON
          expect.any(String), // response_data JSON
          2500,
          expect.any(String), // timestamp
        ]),
      );
    });

    it('должен успешно логировать Embedding запрос', async () => {
      const logData = {
        userTelegramId: 123456789,
        requestType: ENeuralRequestType.EMBEDDING,
        model: 'sentence-transformers/all-MiniLM-L6-v2',
        inputTokens: 8,
        outputTokens: 0,
        totalTokens: 8,
        requestData: {
          input: 'хочу пиццу',
        },
        responseData: undefined,
        processingTimeMs: 150,
      };

      mockRun.mockResolvedValue(undefined);

      const result = await service.logRequest(logData);

      expect(result.responseData).toBeNull();
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO neural_request_logs'),
        expect.arrayContaining([
          expect.any(String),
          123456789,
          ENeuralRequestType.EMBEDDING,
          'sentence-transformers/all-MiniLM-L6-v2',
          8,
          0,
          8,
          expect.any(String),
          null, // response_data должен быть null для embedding
          150,
          expect.any(String),
        ]),
      );
    });
  });

  describe('getUserTokenStats', () => {
    it('должен возвращать статистику токенов пользователя', async () => {
      const mockLogs = [
        {
          id: '1',
          user_telegram_id: '123456789',
          request_type: ENeuralRequestType.LLM_STRUCTURE_QUERY,
          model: 'llama-3.1-8b',
          input_tokens: 120,
          output_tokens: 30,
          total_tokens: 150,
          request_data: {},
          response_data: {},
          processing_time_ms: 2500,
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          user_telegram_id: '123456789',
          request_type: ENeuralRequestType.EMBEDDING,
          model: 'sentence-transformers',
          input_tokens: 8,
          output_tokens: 0,
          total_tokens: 8,
          request_data: {},
          response_data: null,
          processing_time_ms: 150,
          created_at: new Date().toISOString(),
        },
      ];

      mockQuery.mockResolvedValue(mockLogs);

      const stats = await service.getUserTokenStats('123456789', 30);

      expect(stats).toEqual({
        totalTokens: 158,
        inputTokens: 128,
        outputTokens: 30,
        requestCount: 2,
        averageTokensPerRequest: 79,
        requestsByType: {
          [ENeuralRequestType.LLM_STRUCTURE_QUERY]: {
            count: 1,
            totalTokens: 150,
            averageTokens: 150,
          },
          [ENeuralRequestType.LLM_ENHANCE_RESULTS]: {
            count: 0,
            totalTokens: 0,
            averageTokens: 0,
          },
          [ENeuralRequestType.LLM_CATEGORIZE_DISHES]: {
            count: 0,
            totalTokens: 0,
            averageTokens: 0,
          },
          [ENeuralRequestType.EMBEDDING]: {
            count: 1,
            totalTokens: 8,
            averageTokens: 8,
          },
        },
      });
    });

    it('должен возвращать пустую статистику для пользователя без запросов', async () => {
      mockQuery.mockResolvedValue([]);

      const stats = await service.getUserTokenStats('123456789', 30);

      expect(stats).toEqual({
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        requestCount: 0,
        averageTokensPerRequest: 0,
        requestsByType: {
          [ENeuralRequestType.LLM_STRUCTURE_QUERY]: {
            count: 0,
            totalTokens: 0,
            averageTokens: 0,
          },
          [ENeuralRequestType.LLM_ENHANCE_RESULTS]: {
            count: 0,
            totalTokens: 0,
            averageTokens: 0,
          },
          [ENeuralRequestType.LLM_CATEGORIZE_DISHES]: {
            count: 0,
            totalTokens: 0,
            averageTokens: 0,
          },
          [ENeuralRequestType.EMBEDDING]: {
            count: 0,
            totalTokens: 0,
            averageTokens: 0,
          },
        },
      });
    });
  });

  describe('getUserTokenStatsByType', () => {
    it('должен возвращать статистику токенов по типу запроса', async () => {
      const mockLogs = [
        {
          id: '1',
          user_telegram_id: '123456789',
          request_type: ENeuralRequestType.LLM_STRUCTURE_QUERY,
          model: 'llama-3.1-8b',
          input_tokens: 120,
          output_tokens: 30,
          total_tokens: 150,
          request_data: {},
          response_data: {},
          processing_time_ms: 2500,
          created_at: new Date().toISOString(),
        },
      ];

      mockQuery.mockResolvedValue(mockLogs);

      const stats = await service.getUserTokenStatsByType(
        '123456789',
        ENeuralRequestType.LLM_STRUCTURE_QUERY,
        30,
      );

      expect(stats.totalTokens).toBe(150);
      expect(stats.requestCount).toBe(1);
    });
  });

  describe('getRecentLogs', () => {
    it('должен возвращать последние логи пользователя', async () => {
      const mockLogs = [
        {
          id: '1',
          user_telegram_id: '123456789',
          request_type: ENeuralRequestType.LLM_STRUCTURE_QUERY,
          model: 'llama-3.1-8b',
          input_tokens: 120,
          output_tokens: 30,
          total_tokens: 150,
          request_data: {},
          response_data: {},
          processing_time_ms: 2500,
          created_at: new Date().toISOString(),
        },
      ];

      mockQuery.mockResolvedValue(mockLogs);

      const logs = await service.getRecentLogs('123456789', 10);

      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        userTelegramId: '123456789',
        requestType: ENeuralRequestType.LLM_STRUCTURE_QUERY,
        model: 'llama-3.1-8b',
        totalTokens: 150,
      });
    });
  });
});
