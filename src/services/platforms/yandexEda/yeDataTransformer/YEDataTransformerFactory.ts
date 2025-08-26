import { LLMServiceFactory } from '@/services/LLMService/LLMServiceFactory';

import { YEDataTransformer } from './YEDataTransformer';

export class YEDataTransformerFactory {
  private static instance: YEDataTransformer | null = null;

  static getInstance = (): YEDataTransformer => {
    if (!YEDataTransformerFactory.instance) {
      YEDataTransformerFactory.instance = new YEDataTransformer(
        LLMServiceFactory.getInstance(),
      );
    }
    return YEDataTransformerFactory.instance;
  };
}
