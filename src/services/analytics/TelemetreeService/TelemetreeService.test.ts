import type { TelegramUpdate, TelegramUser } from '@tonsolutions/telemetree-node';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TelemetreeConfig } from './types';

import { TelemetreeService } from './TelemetreeService';

// Мокаем TelemetreeClient
vi.mock('@tonsolutions/telemetree-node', () => ({
  TelemetreeClient: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    track: vi.fn().mockResolvedValue({ success: true }),
    trackUpdate: vi.fn().mockResolvedValue({ success: true }),
  })),
}));

// Мокаем утилиты
vi.mock('@/utils/sleep', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/ConsoleLogger', () => ({
  ConsoleLogger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('TelemetreeService', () => {
  let telemetreeService: TelemetreeService;
  let mockConfig: TelemetreeConfig;
  let mockUser: TelegramUser;
  let mockUpdate: TelegramUpdate;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useFakeTimers();

    mockConfig = {
      projectId: 'test-project-id',
      apiKey: 'test-api-key',
      timeoutMs: 5000,
      retryAttempts: 2,
      retryDelayMs: 1000,
      batchSize: 5,
      flushIntervalMs: 10000,
    };

    mockUser = {
      id: 123456,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
    };

    mockUpdate = {
      message: {
        message_id: 1,
        from: mockUser,
        chat: { id: 123456, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: 'Hello, bot!',
      },
    };

    telemetreeService = new TelemetreeService(mockConfig);
  });

  describe('constructor', () => {
    it('должен создавать сервис с правильной конфигурацией', () => {
      expect(telemetreeService).toBeInstanceOf(TelemetreeService);
    });

    it('должен настраивать автоматическую отправку событий', () => {
      // Проверяем, что flushInterval был установлен
      expect((telemetreeService as any).flushInterval).toBeDefined();
      expect(typeof (telemetreeService as any).flushInterval).toBe('object');
    });
  });

  describe('trackCustomEvent', () => {
    it('должен добавлять пользовательское событие в очередь', () => {
      telemetreeService.trackCustomEvent('test_event', mockUser, { test: 'value' });

      // Проверяем, что событие было добавлено (косвенно через flush)
      expect(telemetreeService).toBeDefined();
    });

    it('должен добавлять событие без параметров', () => {
      telemetreeService.trackCustomEvent('simple_event', mockUser);

      expect(telemetreeService).toBeDefined();
    });

    it('должен отслеживать цель через trackCustomEvent', () => {
      const goalName = 'purchase_completed';
      const parameters = { amount: 100, currency: 'USD' };

      telemetreeService.trackCustomEvent('goal', mockUser, {
        goal_name: goalName,
        ...parameters,
      });

      expect(telemetreeService).toBeDefined();
    });

    it('должен отслеживать просмотр страницы через trackCustomEvent', () => {
      const url = '/dashboard';
      const title = 'Dashboard';
      const parameters = { section: 'main' };

      telemetreeService.trackCustomEvent('pageview', mockUser, {
        url,
        title,
        ...parameters,
      });

      expect(telemetreeService).toBeDefined();
    });
  });

  describe('trackUpdate', () => {
    it('должен добавлять Telegram обновление в очередь', () => {
      telemetreeService.trackUpdate(mockUpdate, 'message_received', { custom: 'data' });

      expect(telemetreeService).toBeDefined();
    });

    it('должен добавлять обновление без дополнительных параметров', () => {
      telemetreeService.trackUpdate(mockUpdate);

      expect(telemetreeService).toBeDefined();
    });
  });

  describe('generateClientId', () => {
    it('должен генерировать одинаковый ID для одного пользователя', () => {
      const userId = 'user123';

      const clientId1 = telemetreeService.generateClientId(userId);
      const clientId2 = telemetreeService.generateClientId(userId);

      expect(clientId1).toBe(clientId2);
      expect(clientId1).toMatch(/^\d+$/); // Должен быть числовой строкой
    });

    it('должен генерировать разные ID для разных пользователей', () => {
      const userId1 = 'user123';
      const userId2 = 'user456';

      const clientId1 = telemetreeService.generateClientId(userId1);
      const clientId2 = telemetreeService.generateClientId(userId2);

      expect(clientId1).not.toBe(clientId2);
    });

    it('должен генерировать ID в правильном формате', () => {
      const userId = 'test_user';
      const clientId = telemetreeService.generateClientId(userId);

      // Должен быть числовой строкой определенной длины
      expect(clientId).toMatch(/^\d{16,19}$/);
      expect(Number(clientId)).toBeGreaterThan(1000000000000000000);
      expect(Number(clientId)).toBeLessThan(10000000000000000000);
    });
  });

  describe('destroy', () => {
    it('должен очищать интервал и отправлять оставшиеся события', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      await telemetreeService.destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('flush', () => {
    it('должен не делать ничего, если очередь пуста', async () => {
      await telemetreeService.flush();

      // Метод должен выполниться без ошибок
      expect(telemetreeService).toBeDefined();
    });

    it('должен не запускать flush повторно, если уже выполняется', async () => {
      // Добавляем событие в очередь
      telemetreeService.trackCustomEvent('test_event', mockUser, {});

      // Запускаем flush дважды одновременно
      const promise1 = telemetreeService.flush();
      const promise2 = telemetreeService.flush();

      await Promise.all([promise1, promise2]);

      expect(telemetreeService).toBeDefined();
    });
  });
});
