import { MessageFormatterService } from './MessageFormatter';

export class MessageFormatterFactory {
  private static instance: MessageFormatterService | null = null;

  static getInstance = (): MessageFormatterService => {
    if (!MessageFormatterFactory.instance) {
      MessageFormatterFactory.instance = new MessageFormatterService();
    }
    return MessageFormatterFactory.instance;
  };
}
