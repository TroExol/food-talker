import { MessageFormatterService } from './MessageFormatter';

export class MessageFormatterFactory {
  createMessageFormatter(): MessageFormatterService {
    return new MessageFormatterService();
  }
}
