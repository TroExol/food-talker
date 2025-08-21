import { jsonrepair } from 'jsonrepair';

import type { TSearchResult, TStructuredQuery } from '@/models/search';

import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';
import { botConfig } from '@/config/bot';

interface TLLMService {
  transformQuery: (naturalQuery: string) => Promise<TStructuredQuery>;
  enhanceSearchResults: (results: TSearchResult[], query: string) => Promise<TSearchResult[]>;
}

interface TLLMRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
}

interface TLLMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export class LLMService implements TLLMService {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly timeout: number;

  constructor(config?: {
    maxRetries?: number;
    timeout?: number;
    model?: string;
  }) {
    this.apiUrl = botConfig.llmApiUrl;
    this.apiKey = botConfig.llmApiKey;
    this.model = config?.model ?? 'meta-llama/llama-3.1-8b-instruct';
    this.maxRetries = config?.maxRetries ?? 2;
    this.timeout = config?.timeout ?? 10000; // 10 секунд
  }

  public transformQuery = async (naturalQuery: string): Promise<TStructuredQuery> => {
    try {
      logger.info('Начинаю трансформацию запроса через LLM', { query: naturalQuery });

      const prompt = this.buildQueryTransformPrompt(naturalQuery);
      const response = await this.callLLM(prompt);
      const structuredQuery = this.parseStructuredQuery(response);

      logger.info('Запрос успешно трансформирован', {
        original: naturalQuery,
        structured: structuredQuery,
      });

      return structuredQuery;
    } catch (error) {
      logger.error('Ошибка трансформации запроса через LLM', error as Error, { query: naturalQuery });
      throw AppError.llmError('Не удалось трансформировать запрос', { originalError: error });
    }
  };

  public enhanceSearchResults = async (results: TSearchResult[], query: string): Promise<TSearchResult[]> => {
    try {
      if (results.length === 0) return results;

      logger.info('Начинаю улучшение результатов через LLM', {
        resultsCount: results.length,
        query,
      });

      const prompt = this.buildEnhancementPrompt(results, query);
      const response = await this.callLLM(prompt);
      const enhancedResults = this.parseEnhancedResults(response, results);

      logger.info('Результаты успешно улучшены', {
        originalCount: results.length,
        enhancedCount: enhancedResults.length,
      });

      return enhancedResults;
    } catch (error) {
      logger.warn('Не удалось улучшить результаты через LLM, возвращаю оригинальные', error as Error);
      return results; // Fallback к оригинальным результатам
    }
  };

  private buildQueryTransformPrompt = (query: string): string => {
    return `Ты - помощник для поиска еды. Преобразуй естественный запрос пользователя в структурированный JSON.

Запрос пользователя: "${query}"

Извлеки из запроса следующую информацию:
- restaurants: названия ресторанов (если упоминаются)
- ingredients: ингредиенты блюд
- priceRange: ценовой диапазон (min, max в рублях)
- exclusions: что исключить (рестораны, ингредиенты, ценовой диапазон)

Ответь ТОЛЬКО валидным JSON в следующем формате:
{
  "restaurants": ["название1", "название2"],
  "ingredients": ["ингредиент1", "ингредиент2"],
  "priceRange": {"min": 100, "max": 500},
  "exclusions": {
    "restaurants": ["исключить1"],
    "ingredients": ["исключить2"],
    "priceRange": {"min": 0, "max": 50}
  }
}

Если какое-то поле не найдено, не включай его в JSON.`;
  };

  private buildEnhancementPrompt = (results: TSearchResult[], query: string): string => {
    const resultsText = results.map((result, index) =>
      `${index + 1}. ${result.name} (${result.restaurant.name}) - ${result.price}₽`,
    ).join('\n');

    return `Ты - помощник для ранжирования результатов поиска еды.

Оригинальный запрос: "${query}"

Найденные блюда:
${resultsText}

Проранжируй блюда по релевантности запросу. Верни номера блюд в порядке убывания релевантности, разделенные запятыми. Ограничься 30 блюдами.

Пример ответа: 3,1,5,2,4`;
  };

  private callLLM = async (prompt: string): Promise<string> => {
    const request: TLLMRequest = {
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'Ты - помощник для поиска еды. Отвечай кратко и точно.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1, // Низкая температура для более предсказуемых ответов
      max_tokens: 8000,
    };

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, this.timeout);

        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json() as TLLMResponse;

        if (!data.choices?.[0]?.message?.content) {
          throw new Error('Пустой ответ от LLM');
        }

        logger.debug('LLM ответ получен', {
          tokens: data.usage.total_tokens,
          attempt,
        });

        return data.choices[0].message.content.trim();
      } catch (error) {
        if (attempt === this.maxRetries) {
          throw error;
        }

        logger.warn(`Попытка ${attempt} не удалась, повторяю...`, error as Error);
        await this.delay(1000 * attempt); // Exponential backoff
      }
    }

    throw new Error('Все попытки вызова LLM не удались');
  };

  private parseStructuredQuery = (response: string): TStructuredQuery => {
    try {
      // Извлекаем JSON из ответа (может содержать дополнительный текст)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSON не найден в ответе');
      }

      return this.repairQueryStructure(JSON.parse(jsonrepair(jsonMatch[0])) as TStructuredQuery);
    } catch (error) {
      throw new Error(`Ошибка парсинга JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  private repairQueryStructure = (query: TStructuredQuery): TStructuredQuery => {
    const repairedQuery: TStructuredQuery = {};

    if (query.restaurants) {
      repairedQuery.restaurants = Array.isArray(query.restaurants)
        ? [...new Set(
            query.restaurants
              .filter((r: unknown) => typeof r === 'string' && r !== '')
              .map(r => r.toLowerCase().trim()),
          )]
        : [];
    }

    if (query.ingredients) {
      repairedQuery.ingredients = Array.isArray(query.ingredients)
        ? [...new Set(
            query.ingredients
              .filter((i: unknown) => typeof i === 'string' && i !== '')
              .map(i => i.toLowerCase().trim()),
          )]
        : [];
    }

    if (query.priceRange) {
      if (typeof query.priceRange.min === 'number' && typeof query.priceRange.max === 'number') {
        repairedQuery.priceRange = { min: query.priceRange.min, max: query.priceRange.max };
      }
    }

    if (repairedQuery.priceRange) {
      if (repairedQuery.priceRange.min < 0) {
        repairedQuery.priceRange = { min: 0, max: repairedQuery.priceRange.max };
      }

      if (repairedQuery.priceRange.max < 0) {
        repairedQuery.priceRange = { min: repairedQuery.priceRange.min, max: Number.MAX_SAFE_INTEGER };
      }

      if (repairedQuery.priceRange.min > repairedQuery.priceRange.max) {
        repairedQuery.priceRange = { min: 0, max: repairedQuery.priceRange.max };
      }
    }

    if (query.exclusions) {
      repairedQuery.exclusions = {};

      if (query.exclusions?.restaurants) {
        repairedQuery.exclusions.restaurants = Array.isArray(query.exclusions.restaurants)
          ? [...new Set(
              query.exclusions.restaurants
                .filter((r: unknown) => typeof r === 'string' && r !== '')
                .map(r => r.toLowerCase().trim()),
            )]
          : [];
      }

      if (query.exclusions?.ingredients) {
        repairedQuery.exclusions.ingredients = Array.isArray(query.exclusions.ingredients)
          ? [...new Set(
              query.exclusions.ingredients
                .filter((i: unknown) => typeof i === 'string' && i !== '')
                .map(i => i.toLowerCase().trim()),
            )]
          : [];
      }

      if (query.exclusions?.priceRange) {
        if (typeof query.exclusions.priceRange.min === 'number' && typeof query.exclusions.priceRange.max === 'number') {
          repairedQuery.exclusions.priceRange = {
            min: query.exclusions.priceRange.min,
            max: query.exclusions.priceRange.max,
          };
        }
      }

      if (repairedQuery.exclusions?.priceRange) {
        if (repairedQuery.exclusions.priceRange.min < 0) {
          repairedQuery.exclusions.priceRange = { min: 0, max: repairedQuery.exclusions.priceRange.max };
        }

        if (repairedQuery.exclusions.priceRange.max < 0) {
          repairedQuery.exclusions.priceRange = { min: 0, max: 0 };
        }

        if (repairedQuery.exclusions.priceRange.min > repairedQuery.exclusions.priceRange.max) {
          repairedQuery.exclusions.priceRange = { min: 0, max: repairedQuery.exclusions.priceRange.max };
        }
      }
    }

    return repairedQuery;
  };

  private parseEnhancedResults = (response: string, originalResults: TSearchResult[]): TSearchResult[] => {
    try {
      // Извлекаем номера из ответа
      const numbers = response.match(/\d+/g)?.map(Number) || [];

      if (numbers.length === 0) {
        return originalResults;
      }

      // Создаем новый массив с переупорядоченными результатами
      const enhancedResults: TSearchResult[] = [];

      for (const number of numbers) {
        const index = number - 1; // Нумерация с 1
        if (index >= 0 && index < originalResults.length) {
          enhancedResults.push(originalResults[index]);
        }
      }

      // Добавляем оставшиеся результаты в конец
      for (let i = 0; i < originalResults.length; i++) {
        if (!enhancedResults.includes(originalResults[i])) {
          enhancedResults.push(originalResults[i]);
        }
      }

      return enhancedResults;
    } catch (error) {
      logger.warn('Ошибка парсинга улучшенных результатов', error as Error);
      return originalResults;
    }
  };

  private delay = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));
}
