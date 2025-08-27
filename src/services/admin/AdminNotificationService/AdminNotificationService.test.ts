import type { InlineKeyboardMarkup } from 'telegraf/types';
import type { Telegraf } from 'telegraf';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppError } from '@/utils/AppError';
import { MessageFormatterService } from '@/services/message/MessageFormatter/MessageFormatter';
import { environment } from '@/config/environment';

import { AdminNotificationService } from './AdminNotificationService';

// Мокаем environment
vi.mock('@/config/environment', () => ({
  environment: {
    ADMIN_TELEGRAM_ID: '123456789',
  },
}));

describe('AdminNotificationService', () => {
  let service: AdminNotificationService;
  let mockBot: Telegraf;

  beforeEach(() => {
    // Создаем мок для Telegraf
    mockBot = {
      telegram: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Telegraf;

    const messageFormatter = new MessageFormatterService();

    service = new AdminNotificationService(mockBot, messageFormatter);
  });

  describe('notifyAdmin', () => {
    it('должен отправить уведомление админу при критической ошибке', async () => {
      const error = AppError.apiError('API_FAILED', 'Ошибка API');
      const context = { userId: 123, chatId: 456 };

      await service.notifyAdmin(error, context);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        '123456789',
        expect.stringContaining('🚨'),
        { parse_mode: 'HTML', reply_markup: expect.any(Object) as InlineKeyboardMarkup },
      );
    });

    it('не должен отправлять уведомление если ADMIN_TELEGRAM_ID не установлен', async () => {
      // Временно убираем ADMIN_TELEGRAM_ID
      vi.mocked(environment).ADMIN_TELEGRAM_ID = undefined;

      const error = AppError.apiError('API_FAILED', 'Ошибка API');

      await service.notifyAdmin(error);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();

      // Восстанавливаем значение
      vi.mocked(environment).ADMIN_TELEGRAM_ID = '123456789';
    });

    it('должен обрабатывать ошибки отправки уведомления', async () => {
      const sendError = new Error('Telegram API error');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      vi.mocked(mockBot.telegram.sendMessage).mockRejectedValue(sendError);

      const error = AppError.apiError('API_FAILED', 'Ошибка API');

      // Не должно выбрасывать исключение
      await expect(service.notifyAdmin(error)).resolves.toBeUndefined();
    });
  });

  describe('notifySystemError', () => {
    it('должен отправить уведомление о системной ошибке', async () => {
      const error = new Error('Системная ошибка');
      const context = { userId: 123 };

      await service.notifySystemError(error, context);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        '123456789',
        expect.stringContaining('⚠️ <b>Системная ошибка</b>'),
        { parse_mode: 'HTML', reply_markup: expect.any(Object) as InlineKeyboardMarkup },
      );
    });

    it('не должен отправлять уведомление если ADMIN_TELEGRAM_ID не установлен', async () => {
      vi.mocked(environment).ADMIN_TELEGRAM_ID = undefined;

      const error = new Error('Системная ошибка');

      await service.notifySystemError(error);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();

      vi.mocked(environment).ADMIN_TELEGRAM_ID = '123456789';
    });
  });

  describe('форматирование сообщений', () => {
    it('должен форматировать сообщение с контекстом', async () => {
      const error = AppError.databaseError('DB_CONNECTION_FAILED', 'Ошибка подключения к БД');
      const context = {
        userId: 123,
        chatId: 456,
        username: 'testuser',
        additionalInfo: 'test data',
      };

      await service.notifyAdmin(error, context);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const callArgs = vi.mocked(mockBot.telegram.sendMessage).mock.calls[0];
      const message = callArgs[1] as string;

      expect(message).toContain('🚨');
      expect(message).toContain('DB_CONNECTION_FAILED');
      expect(message).toContain('DB_CONNECTION_FAILED');
      expect(message).toContain('testuser');
      expect(message).toContain('test data');
    });

    it('должен форматировать системную ошибку со стеком', async () => {
      const error = new Error('Тестовая ошибка');
      error.stack = 'Error: Тестовая ошибка\n    at test.js:1:1';

      await service.notifySystemError(error);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const callArgs = vi.mocked(mockBot.telegram.sendMessage).mock.calls[0];
      const message = callArgs[1] as string;

      expect(message).toContain('⚠️');
      expect(message).toContain('Тестовая ошибка');
      expect(message).toContain('test.js:1:1');
    });
  });
});
