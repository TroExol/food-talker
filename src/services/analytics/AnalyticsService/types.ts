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
