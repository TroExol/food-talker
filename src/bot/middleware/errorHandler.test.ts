import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TBotContext } from '@/types/telegram';
import type { MessageFormatterService } from '@/services/message/MessageFormatter/MessageFormatter';
import type { AnalyticsService } from '@/services/analytics/AnalyticsService/AnalyticsService';
import type { AdminNotificationService } from '@/services/admin/AdminNotificationService/AdminNotificationService';

import { AppError } from '@/utils/AppError';

import { ErrorHandlerMiddleware } from './errorHandler';

describe('ErrorHandlerMiddleware', () => {
  let middleware: ErrorHandlerMiddleware;
  let mockMessageFormatter: MessageFormatterService;
  let mockAdminNotificationService: AdminNotificationService;
  let mockAnalyticsService: AnalyticsService;
  let mockContext: TBotContext;

  beforeEach(() => {
    mockMessageFormatter = {
      formatErrorMessage: vi.fn().mockReturnValue({
        text: 'Форматированная ошибка',
        parseMode: 'HTML',
        replyMarkup: undefined,
      }),
    } as unknown as MessageFormatterService;

    mockAdminNotificationService = {
      notifyAdmin: vi.fn().mockResolvedValue(undefined),
      notifySystemError: vi.fn().mockResolvedValue(undefined),
    } as unknown as AdminNotificationService;

    mockContext = {
      reply: vi.fn().mockResolvedValue(undefined),
      from: { id: 123, username: 'testuser' },
      chat: { id: 456 },
    } as unknown as TBotContext;

    mockAnalyticsService = {
      trackError: vi.fn(),
      trackPerformance: vi.fn(),
      trackSearchQueryStarted: vi.fn(),
      trackSearchQueryCompleted: vi.fn(),
      trackUserStateChanged: vi.fn(),
    } as unknown as AnalyticsService;

    middleware = new ErrorHandlerMiddleware(
      mockMessageFormatter,
      mockAdminNotificationService,
      mockAnalyticsService,
    );
  });

  describe('handleError', () => {
    it('должен отправлять уведомление админу при критической ошибке', async () => {
      const criticalError = AppError.apiError('API_FAILED', 'Ошибка API');
      const next = vi.fn().mockRejectedValue(criticalError);

      await middleware.handleError(mockContext, next);

      expect(mockAdminNotificationService.notifyAdmin).toHaveBeenCalledWith(
        criticalError,
        {
          userId: 123,
          chatId: 456,
          username: 'testuser',
        },
      );
    });

    it('не должен отправлять уведомление админу при пользовательских ошибках', async () => {
      const userError = AppError.validationError('Неверный ввод');
      const next = vi.fn().mockRejectedValue(userError);

      await middleware.handleError(mockContext, next);

      expect(mockAdminNotificationService.notifyAdmin).not.toHaveBeenCalled();
    });

    it('должен отправлять уведомление админу при системных ошибках', async () => {
      const systemError = new Error('Системная ошибка');
      const next = vi.fn().mockRejectedValue(systemError);

      await middleware.handleError(mockContext, next);

      expect(mockAdminNotificationService.notifySystemError).toHaveBeenCalledWith(
        systemError,
        {
          userId: 123,
          chatId: 456,
          username: 'testuser',
        },
      );
    });

    it('должен отправлять пользователю сообщение об ошибке', async () => {
      const error = AppError.apiError('API_FAILED', 'Ошибка API');
      const next = vi.fn().mockRejectedValue(error);

      await middleware.handleError(mockContext, next);

      expect(mockMessageFormatter.formatErrorMessage).toHaveBeenCalledWith(error);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockContext.reply).toHaveBeenCalledWith(
        'Форматированная ошибка',
        {
          parse_mode: 'HTML',
          reply_markup: undefined,
        },
      );
    });

    it('должен обрабатывать ошибки отправки сообщения пользователю', async () => {
      const error = AppError.apiError('API_FAILED', 'Ошибка API');
      const next = vi.fn().mockRejectedValue(error);
      const replyError = new Error('Ошибка отправки');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      vi.mocked(mockContext.reply).mockRejectedValue(replyError);

      // Не должно выбрасывать исключение
      await expect(middleware.handleError(mockContext, next)).resolves.toBeUndefined();
    });
  });

  describe('isCriticalError', () => {
    it('должен определять критические ошибки', () => {
      const criticalErrors = [
        AppError.apiError('API_FAILED', 'Ошибка API'),
        AppError.databaseError('DB_ERROR', 'Ошибка БД'),
        AppError.llmError('LLM_ERROR', 'Ошибка LLM'),
        AppError.embeddingError('EMBEDDING_ERROR', 'Ошибка эмбеддинга'),
        AppError.cacheError('CACHE_ERROR', 'Ошибка кэша'),
        AppError.dataCollectionError('COLLECTION_ERROR', 'Ошибка сбора данных'),
        AppError.systemError('SYSTEM_ERROR', 'Системная ошибка'),
      ];

      criticalErrors.forEach(error => {
        expect(middleware['isCriticalError'](error)).toBe(true);
      });
    });

    it('не должен определять пользовательские ошибки как критические', () => {
      const userErrors = [
        AppError.validationError('Неверный ввод'),
        AppError.userNotFound(123),
        AppError.cityNotSupported('Город не поддерживается'),
        AppError.rateLimitError('Превышен лимит запросов'),
      ];

      userErrors.forEach(error => {
        expect(middleware['isCriticalError'](error)).toBe(false);
      });
    });
  });
});
