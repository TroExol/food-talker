export enum EApiRequestType {
  YANDEX_EDA_MENU = 'yandex_eda_menu',
  YANDEX_EDA_PLACE = 'yandex_eda_place',
  YANDEX_EDA_RESTAURANTS = 'yandex_eda_restaurants',
}

export interface TApiRequestLog {
  id: string;
  userTelegramId: number | null;
  requestType: EApiRequestType;
  endpoint: string;
  method: string;
  statusCode: number;
  requestData: Record<string, unknown> | null;
  responseData: Record<string, unknown> | null;
  processingTimeMs: number;
  errorMessage: string | null;
  createdAt: Date;
}

export interface TApiRequestLogEntity {
  id: string;
  user_telegram_id: number | null;
  request_type: string;
  endpoint: string;
  method: string;
  status_code: number;
  request_data: Record<string, unknown> | null;
  response_data: Record<string, unknown> | null;
  processing_time_ms: number;
  error_message: string | null;
  created_at: string; // ISO string
}

export interface TCreateApiRequestLog {
  userTelegramId?: number;
  requestType: EApiRequestType;
  endpoint: string;
  method: string;
  statusCode: number;
  requestData?: Record<string, unknown>;
  responseData?: Record<string, unknown>;
  processingTimeMs: number;
  errorMessage?: string;
}

export interface TApiRequestStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTimeMs: number;
  requestsByType: Record<EApiRequestType, {
    count: number;
    successCount: number;
    failureCount: number;
    averageResponseTimeMs: number;
  }>;
  requestsByEndpoint: Record<string, {
    count: number;
    successCount: number;
    failureCount: number;
    averageResponseTimeMs: number;
  }>;
}
