import type { TelegramUpdate, TelegramUser } from '@tonsolutions/telemetree-node';

export interface AnalyticsEvent {
  name: string;
  parameters: Record<string, unknown>;
  timestamp: number;
  user: TelegramUser; // Telegram пользователь
  update?: TelegramUpdate; // Telegram обновление для trackUpdate
}

export interface NeuralSummary {
  period_minutes: number;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  average_response_time_ms: number;
  total_tokens_used?: number;
  total_vectors_processed?: number;
  user: TelegramUser;
}

export interface TAnalyticsConfig {
  enabled: boolean;
  batchSize: number;
  flushIntervalMs: number;
  retryAttempts: number;
  retryDelayMs: number;
}

export interface TTrackErrorParams {
  error: Error;
  context: Record<string, unknown>;
  user: TelegramUser;
}

export interface TTrackPerformanceParams {
  operation: string;
  duration: number;
  user: TelegramUser;
}

export interface TTrackNeuralSummaryParams {
  serviceType: 'llm' | 'embedding';
  summary: NeuralSummary;
  user: TelegramUser;
}

export interface TTrackBotCommandParams {
  command: string;
  userState: string;
  userCity: string | null;
  user: TelegramUser;
  update?: TelegramUpdate; // Для отслеживания команды через trackUpdate
}

export interface TTrackSearchQueryStartedParams {
  id: string;
  query: string;
  userCity: string;
  searchOptions: Record<string, unknown>;
  user: TelegramUser;
}

export interface TTrackSearchQueryCompletedParams {
  id: string;
  queryLength: number;
  resultsCount: number;
  processingTimeMs: number;
  searchMethod: string;
  hasLlmEnhancement: boolean;
  hasVectorSearch: boolean;
  user: TelegramUser;
}

export interface TTrackUserStateChangedParams {
  oldState: string;
  newState: string;
  trigger: string;
  user: TelegramUser;
}

export interface TTrackBotCommandErrorParams {
  command: string;
  errorType: string;
  errorMessage: string;
  userState: string;
  user: TelegramUser;
}

export interface TTrackMessageReceivedParams {
  messageLength: number;
  userState: string;
  userCity: string | null;
  messageType: string;
  user: TelegramUser;
  update: TelegramUpdate; // Обязательно для отслеживания сообщения
}

export interface TTrackSearchLimitExceededParams {
  userSubscription: string;
  searchesToday: number;
  searchLimit: number;
  remainingSearches: number;
  user: TelegramUser;
}

export interface TTrackCallbackButtonClickedParams {
  buttonType: string;
  buttonData: string;
  userState: string;
  user: TelegramUser;
}

export interface TTrackCitySelectionCompletedParams {
  selectedCity: string;
  selectionMethod: string;
  oldCity: string | null;
  user: TelegramUser;
}

export interface TTrackItemSelectionCompletedParams {
  searchHistoryId: string;
  itemIndex: number;
  hasPhoto: boolean;
  user: TelegramUser;
}

export interface TTrackPageNavigationCompletedParams {
  searchHistoryId: string;
  pageNumber: number;
  totalPages: number;
  user: TelegramUser;
}

export interface TTrackHistoryItemRepeatedParams {
  historyItemId: string;
  originalQuery: string;
  queryLength: number;
  user: TelegramUser;
}

export interface TTrackSearchHistoryViewedParams {
  historyItemsCount: number;
  viewedItemsCount: number;
  user: TelegramUser;
}

export interface TTrackUserStatsViewedParams {
  userSubscription: string;
  searchesToday: number;
  searchesThisMonth: number;
  totalSearches: number;
  user: TelegramUser;
}
