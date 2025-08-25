import { llmService } from '@/services/search/LLMService/instances';

import { YEDataTransformer } from './YEDataTransformer';

export const yeDataTransformer = new YEDataTransformer(llmService);
