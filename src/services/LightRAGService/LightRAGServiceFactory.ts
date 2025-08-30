import { LightRAGService } from './LightRAGService';

export class LightRAGServiceFactory {
  private static instance: LightRAGService | null = null;

  static getInstance = (): LightRAGService => {
    if (!LightRAGServiceFactory.instance) {
      LightRAGServiceFactory.instance = new LightRAGService({
        baseUrl: process.env.LIGHTRAG_BASE_URL ?? '',
        apiKey: process.env.LIGHTRAG_API_KEY ?? '',
      });
    }

    return LightRAGServiceFactory.instance;
  };
}
