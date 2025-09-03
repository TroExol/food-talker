import type { TelegramUpdate, TelegramUser } from '@tonsolutions/telemetree-node';

export interface TelemetreeConfig {
  projectId: string;
  apiKey: string;
  timeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  batchSize: number;
  flushIntervalMs: number;
}

// Для пользовательских событий с Telegram пользователем
export interface TelemetreeCustomEvent {
  eventName: string;
  user: TelegramUser;
  properties?: Record<string, unknown>;
}

// Для событий на основе Telegram обновлений
export interface TelemetreeUpdateEvent {
  update: TelegramUpdate;
  eventType?: string;
  properties?: Record<string, unknown>;
}

export interface TelemetreeBatch {
  customEvents: TelemetreeCustomEvent[];
  updateEvents: TelemetreeUpdateEvent[];
  timestamp: number;
}
