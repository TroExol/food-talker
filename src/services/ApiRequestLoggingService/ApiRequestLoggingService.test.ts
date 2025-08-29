import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TDatabaseConnection } from '@/services/database/types';

import { EApiRequestType } from '@/types/apiRequestLogging';

import { ApiRequestLoggingService } from './ApiRequestLoggingService';

const mockRun = vi.fn();
const mockQuery = vi.fn();

describe('ApiRequestLoggingService', () => {
  let service: ApiRequestLoggingService;
  let mockDb: TDatabaseConnection;

  beforeEach(() => {
    mockDb = {
      run: mockRun,
      query: mockQuery,
    } as unknown as TDatabaseConnection;
    service = new ApiRequestLoggingService(mockDb);
  });

  describe('logRequest', () => {
    it('должен успешно логировать успешный API запрос', async () => {
      const logData = {
        userTelegramId: 123456789,
        requestType: EApiRequestType.YANDEX_EDA_RESTAURANTS,
        endpoint: '/eats/v1/layout-constructor/v1/layout',
        method: 'POST',
        statusCode: 200,
        requestData: {
          location: { latitude: 58.0105, longitude: 56.2502 },
        },
        responseData: {
          data: { places_v2_lists: [{ payload: { places: [] } }] },
        },
        processingTimeMs: 1500,
      };

      mockRun.mockResolvedValue(undefined);

      const result = await service.logRequest(logData);

      expect(result).toMatchObject({
        userTelegramId: 123456789,
        requestType: EApiRequestType.YANDEX_EDA_RESTAURANTS,
        endpoint: '/eats/v1/layout-constructor/v1/layout',
        method: 'POST',
        statusCode: 200,
        processingTimeMs: 1500,
      });

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO api_request_logs'),
        expect.arrayContaining([
          expect.any(String), // id
          123456789,
          EApiRequestType.YANDEX_EDA_RESTAURANTS,
          '/eats/v1/layout-constructor/v1/layout',
          'POST',
          200,
          expect.any(String), // request_data JSON
          expect.any(String), // response_data JSON
          1500,
          null, // error_message
          expect.any(String), // timestamp
        ]),
      );
    });

    it('должен успешно логировать неудачный API запрос', async () => {
      const logData = {
        userTelegramId: 123456789,
        requestType: EApiRequestType.YANDEX_EDA_MENU,
        endpoint: '/api/v2/menu/retrieve/123',
        method: 'GET',
        statusCode: 404,
        requestData: {
          restaurantId: '123',
          coordinates: { latitude: 58.0105, longitude: 56.2502 },
        },
        responseData: undefined,
        processingTimeMs: 800,
        errorMessage: 'Restaurant not found',
      };

      mockRun.mockResolvedValue(undefined);

      const result = await service.logRequest(logData);

      expect(result.errorMessage).toBe('Restaurant not found');
      expect(result.statusCode).toBe(404);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO api_request_logs'),
        expect.arrayContaining([
          expect.any(String),
          123456789,
          EApiRequestType.YANDEX_EDA_MENU,
          '/api/v2/menu/retrieve/123',
          'GET',
          404,
          expect.any(String),
          null, // response_data
          800,
          'Restaurant not found', // error_message
          expect.any(String),
        ]),
      );
    });
  });

  describe('getUserApiStats', () => {
    it('должен возвращать статистику API запросов пользователя', async () => {
      const mockLogs = [
        {
          id: '1',
          user_telegram_id: 123456789,
          request_type: EApiRequestType.YANDEX_EDA_RESTAURANTS,
          endpoint: '/eats/v1/layout-constructor/v1/layout',
          method: 'POST',
          status_code: 200,
          request_data: {},
          response_data: {},
          processing_time_ms: 1500,
          error_message: null,
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          user_telegram_id: 123456789,
          request_type: EApiRequestType.YANDEX_EDA_MENU,
          endpoint: '/api/v2/menu/retrieve/123',
          method: 'GET',
          status_code: 404,
          request_data: {},
          response_data: null,
          processing_time_ms: 800,
          error_message: 'Not found',
          created_at: new Date().toISOString(),
        },
      ];

      mockQuery.mockResolvedValue(mockLogs);

      const stats = await service.getUserApiStats(123456789, 30);

      expect(stats).toEqual({
        totalRequests: 2,
        successfulRequests: 1,
        failedRequests: 1,
        averageResponseTimeMs: 1150,
        requestsByType: {
          [EApiRequestType.YANDEX_EDA_RESTAURANTS]: {
            count: 1,
            successCount: 1,
            failureCount: 0,
            averageResponseTimeMs: 1500,
          },
          [EApiRequestType.YANDEX_EDA_MENU]: {
            count: 1,
            successCount: 0,
            failureCount: 1,
            averageResponseTimeMs: 800,
          },
          [EApiRequestType.YANDEX_EDA_PLACE]: {
            count: 0,
            successCount: 0,
            failureCount: 0,
            averageResponseTimeMs: 0,
          },
        },
        requestsByEndpoint: {
          '/eats/v1/layout-constructor/v1/layout': {
            count: 1,
            successCount: 1,
            failureCount: 0,
            averageResponseTimeMs: 1500,
          },
          '/api/v2/menu/retrieve/123': {
            count: 1,
            successCount: 0,
            failureCount: 1,
            averageResponseTimeMs: 800,
          },
        },
      });
    });

    it('должен возвращать пустую статистику для пользователя без запросов', async () => {
      mockQuery.mockResolvedValue([]);

      const stats = await service.getUserApiStats(123456789, 30);

      expect(stats).toEqual({
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTimeMs: 0,
        requestsByType: {
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
        },
        requestsByEndpoint: {},
      });
    });
  });

  describe('getApiStatsByType', () => {
    it('должен возвращать статистику API запросов по типу', async () => {
      const mockLogs = [
        {
          id: '1',
          user_telegram_id: 123456789,
          request_type: EApiRequestType.YANDEX_EDA_RESTAURANTS,
          endpoint: '/eats/v1/layout-constructor/v1/layout',
          method: 'POST',
          status_code: 200,
          request_data: {},
          response_data: {},
          processing_time_ms: 1500,
          error_message: null,
          created_at: new Date().toISOString(),
        },
      ];

      mockQuery.mockResolvedValue(mockLogs);

      const stats = await service.getApiStatsByType(
        123456789,
        EApiRequestType.YANDEX_EDA_RESTAURANTS,
        30,
      );

      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(1);
      expect(stats.averageResponseTimeMs).toBe(1500);
    });
  });

  describe('getRecentApiLogs', () => {
    it('должен возвращать последние API логи пользователя', async () => {
      const mockLogs = [
        {
          id: '1',
          user_telegram_id: 123456789,
          request_type: EApiRequestType.YANDEX_EDA_RESTAURANTS,
          endpoint: '/eats/v1/layout-constructor/v1/layout',
          method: 'POST',
          status_code: 200,
          request_data: {},
          response_data: {},
          processing_time_ms: 1500,
          error_message: null,
          created_at: new Date().toISOString(),
        },
      ];

      mockQuery.mockResolvedValue(mockLogs);

      const logs = await service.getRecentApiLogs(123456789, 10);

      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        userTelegramId: 123456789,
        requestType: EApiRequestType.YANDEX_EDA_RESTAURANTS,
        endpoint: '/eats/v1/layout-constructor/v1/layout',
        method: 'POST',
        statusCode: 200,
        processingTimeMs: 1500,
      });
    });
  });

  describe('getFailedRequests', () => {
    it('должен возвращать неудачные API запросы', async () => {
      const mockLogs = [
        {
          id: '1',
          user_telegram_id: 123456789,
          request_type: EApiRequestType.YANDEX_EDA_MENU,
          endpoint: '/api/v2/menu/retrieve/123',
          method: 'GET',
          status_code: 404,
          request_data: {},
          response_data: null,
          processing_time_ms: 800,
          error_message: 'Not found',
          created_at: new Date().toISOString(),
        },
      ];

      mockQuery.mockResolvedValue(mockLogs);

      const logs = await service.getFailedRequests(123456789, 30);

      expect(logs).toHaveLength(1);
      expect(logs[0].statusCode).toBe(404);
      expect(logs[0].errorMessage).toBe('Not found');
    });
  });
});
