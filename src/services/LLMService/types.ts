export interface TLLMConfig {
  model: string;
  maxRetries?: number;
  timeoutMs?: number;
  systemPrompt?: string;
  cacheTTL?: number;
}

export interface TLLMRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
}

export interface TLLMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
  };
}
