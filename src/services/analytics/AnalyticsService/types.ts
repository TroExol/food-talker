export interface AnalyticsEvent {
  name: string;
  parameters: Record<string, unknown>;
  timestamp: number;
  user_id?: number;
  session_id?: string;
}

export interface NeuralSummary {
  period_minutes: number;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  average_response_time_ms: number;
  total_tokens_used?: number;
  total_vectors_processed?: number;
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
}

export interface TTrackPerformanceParams {
  operation: string;
  duration: number;
}

export interface TTrackNeuralSummaryParams {
  serviceType: 'llm' | 'embedding';
  summary: NeuralSummary;
}

export interface TTrackBotCommandParams {
  command: string;
  userState: string;
  userCity?: string;
  userId: number;
}

export interface TTrackSearchQueryStartedParams {
  id: string;
  query: string;
  userCity: string;
  searchOptions: Record<string, unknown>;
  userId: number;
}

export interface TTrackSearchQueryCompletedParams {
  id: string;
  queryLength: number;
  resultsCount: number;
  processingTimeMs: number;
  searchMethod: string;
  hasLlmEnhancement: boolean;
  hasVectorSearch: boolean;
  userId: number;
}

export interface TTrackUserStateChangedParams {
  oldState: string;
  newState: string;
  trigger: string;
  userId: number;
}

export interface TTrackBotCommandErrorParams {
  command: string;
  errorType: string;
  errorMessage: string;
  userState: string;
  userId?: number;
}

export interface TTrackMessageReceivedParams {
  messageLength: number;
  userState: string;
  userCity?: string;
  messageType: string;
  userId: number;
}

export interface TTrackSearchQueryErrorParams {
  id: string;
  queryLength: number;
  errorType: string;
  errorMessage: string;
  processingTimeMs: number;
  searchMethod: string;
  userId?: number;
}

export interface TTrackSearchLimitExceededParams {
  userSubscription: string;
  searchesToday: number;
  searchLimit: number;
  remainingSearches: number;
  userId: number;
}

export interface TTrackCallbackButtonClickedParams {
  buttonType: string;
  buttonData: string;
  userState: string;
  userId: number;
}

export interface TTrackCitySelectionCompletedParams {
  selectedCity: string;
  selectionMethod: string;
  oldCity?: string;
  userId: number;
}

export interface TTrackItemSelectionCompletedParams {
  searchHistoryId: string;
  itemId: string;
  hasPhoto: boolean;
  userId: number;
}

export interface TTrackPageNavigationCompletedParams {
  searchHistoryId: string;
  pageNumber: number;
  totalPages: number;
  userId: number;
}

export interface TTrackHistoryItemRepeatedParams {
  historyItemId: string;
  originalQuery: string;
  queryLength: number;
  userId: number;
}

export interface TTrackNeuralServiceErrorParams {
  serviceType: 'llm' | 'embedding';
  errorType: string;
  errorMessage: string;
  retryCount: number;
}

export interface TTrackRateLimitExceededParams {
  limitType: string;
  currentRequests: number;
  limitValue: number;
  userId?: number;
}

export interface TTrackCacheMissParams {
  cacheType: string;
  cacheKey: string;
  dataType: string;
}

export interface TTrackSearchHistoryViewedParams {
  historyItemsCount: number;
  viewedItemsCount: number;
  userId: number;
}

export interface TTrackUserStatsViewedParams {
  userSubscription: string;
  searchesToday: number;
  searchesThisMonth: number;
  totalSearches: number;
  userId: number;
}

export interface TTrackBotStartedParams {
  botVersion: string;
  environment: string;
  startupTimeMs: number;
}

export interface TTrackBotStoppedParams {
  uptimeMinutes: number;
  totalRequests: number;
  totalErrors: number;
}
