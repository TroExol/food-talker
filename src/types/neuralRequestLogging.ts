export enum ENeuralRequestType {
  EMBEDDING = 'embedding',
  LLM_CATEGORIZE_DISHES = 'llm_categorize_dishes',
  LLM_ENHANCE_RESULTS = 'llm_enhance_results',
  LLM_STRUCTURE_QUERY = 'llm_structure_query',
}

export interface TNeuralRequestLog {
  id: string;
  userTelegramId: number | null;
  requestType: ENeuralRequestType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestData: Record<string, unknown> | null;
  responseData: Record<string, unknown> | null;
  processingTimeMs: number;
  createdAt: Date;
}

export interface TNeuralRequestLogEntity {
  id: string;
  user_telegram_id: number | null;
  request_type: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  request_data: Record<string, unknown> | null;
  response_data: Record<string, unknown> | null;
  processing_time_ms: number;
  created_at: string; // ISO string
}

export interface TCreateNeuralRequestLog {
  userTelegramId?: number;
  requestType: ENeuralRequestType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestData?: Record<string, unknown>;
  responseData?: Record<string, unknown>;
  processingTimeMs: number;
}

export interface TTokenUsageStats {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  averageTokensPerRequest: number;
  requestsByType: Record<ENeuralRequestType, {
    count: number;
    totalTokens: number;
    averageTokens: number;
  }>;
}
