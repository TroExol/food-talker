import type {
  ResponseFormatJSONObject,
  ResponseFormatJSONSchema,
  ResponseFormatText,
} from 'openai/resources/index';

import type { ENeuralRequestType } from '@/types/neuralRequestLogging';

export interface TLLMConfig {
  maxRetries?: number;
  timeoutMs?: number;
  systemPrompt?: string;
  cacheTTL?: number;
}

export interface TLLMParams {
  temperature?: number;
  max_tokens?: number;
}

export interface TLLMRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  params?: TLLMParams;
  response_format?: ResponseFormatText
    | ResponseFormatJSONSchema
    | ResponseFormatJSONObject;
  provider?: Record<string, unknown>;
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
  };
}

export interface TLLMResponse {
  choices: Array<{
    message: {
      content: string;
      reasoning?: string;
    };
  }>;
  usage: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export interface TLLMBuildedQuery {
  systemPrompt: string;
  responseFormat: ResponseFormatText
    | ResponseFormatJSONSchema
    | ResponseFormatJSONObject;
  prompt: string;
}

export interface TLLMCallParams {
  prompt: string;
  url: string;
  requestType: ENeuralRequestType;
  model: string;
  fallbackModel?: string;
  systemPrompt?: string;
  fallbackSystemPrompt?: string;
  responseFormat?: ResponseFormatText
    | ResponseFormatJSONSchema
    | ResponseFormatJSONObject;
  userTelegramId?: number;
  params?: TLLMParams;
  waitTimeoutMs?: number;
  provider?: Record<string, unknown>;
  fallbackProvider?: Record<string, unknown>;
  reasoning?: {
    effort: 'low' | 'medium' | 'high';
  };
  fallbackReasoning?: {
    effort?: 'low' | 'medium' | 'high';
  };
}

export interface TLLMStructureQueryStructuredOutput {
  semanticQuery: string;
  restaurants: string[];
  tags: string[];
  category: string | null;
  priceMin: number | null;
  priceMax: number | null;
  exclusions_restaurants: string[];
  exclusions_tags: string[];
  exclusions_category: string | null;
  exclusions_priceMin: number | null;
  exclusions_priceMax: number | null;
}
