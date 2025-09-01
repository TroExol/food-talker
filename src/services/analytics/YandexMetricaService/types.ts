export interface YandexMetricaConfig {
  counterId: string;
  measurementProtocolToken: string;
  endpoint: string;
  timeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
}

export interface YandexMetricaEvent {
  name: string;
  parameters: Record<string, unknown>;
  timestamp: number;
  user_id?: string;
  session_id?: string;
  dt?: string; // формат 'YYYY-MM-DD'
}

export interface YandexMetricaBatch {
  events: YandexMetricaEvent[];
  timestamp: number;
}
