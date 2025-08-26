import type { TBotConfig } from './types';

import { EAvailableCities } from './types';

export const botConfig: TBotConfig = {
  sanitizer: {
    userSearchPrompt: {
      maxLength: 500,
      minLength: 2,
    },
  },
  cache: {
    ttlMenu: 1800,
  },
  availableCities: Object.values(EAvailableCities),
  yandexEda: {
    baseUrl: 'https://eda.yandex.ru',
    headers: {
      'Content-Type': 'application/json',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'x-app-version': '17.52.4',
      'x-platform': 'desktop_web',
      'x-client-session': 'mei8lrkd-d49t83iglm-2sset7rzpp6-8qnt1cacvd',
      'x-device-id': 'mei8lrkd-fnbl951fo7-vqvkmfvgb8f-cgrtjueuxx8',
      'x-taxi': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 platform=eats_desktop_web',
    },
    rateLimits: {
      requestsPerMinute: 100,
      requestsPerHour: 1000,
    },
    delayBetweenRequestsMs: 200,
    retries: 3,
  },
  fallbackFoodImage: 'https://i.postimg.cc/Vk5DKb2j/generated-image.jpg',
};
