export interface TLLMConfig {
  model: string;
  maxRetries?: number;
  timeoutMs?: number;
  systemPrompt?: string;
  cacheTTL?: number;
}
