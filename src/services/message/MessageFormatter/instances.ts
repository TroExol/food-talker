import { MessageFormatterFactory } from './MessageFormatterFactory';

const messageFormatterFactory = new MessageFormatterFactory();

export const messageFormatter = messageFormatterFactory.createMessageFormatter();
