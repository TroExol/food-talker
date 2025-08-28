import { LLMServiceFactory } from '@/services/LLMService/LLMServiceFactory';

import { YEDataTransformer } from './YEDataTransformer';

export class YEDataTransformerFactory {
  private static instance: YEDataTransformer | null = null;

  static getInstance = async (): Promise<YEDataTransformer> => {
    if (!YEDataTransformerFactory.instance) {
      YEDataTransformerFactory.instance = new YEDataTransformer(
        await LLMServiceFactory.getInstance(),
      );
    }
    return YEDataTransformerFactory.instance;
  };
}
