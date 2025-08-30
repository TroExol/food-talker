export type TSearchOptions = {
  enableLLMEnhancement?: boolean;
  maxEnhenceMenu?: number;
} & (
  {
    enableVectorSearch: true;
    searchIn: 'lightRAG' | 'RAG';
  } | {
    enableVectorSearch: false;
  }
);
