import { jsonrepair } from 'jsonrepair';
import { createHash } from 'crypto';

import type { TSearchResultItem, TStructuredQuery } from '@/types/search';
import type { CacheService } from '@/services/cacheService/CacheService';

import { sleep } from '@/utils/sleep';
import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { botConfig } from '@/config/bot';

import type { TLLMConfig } from './types';

interface TLLMService {
  stuctureQuery: (naturalQuery: string, restaurants: string[]) => Promise<TStructuredQuery>;
  enhanceSearchResults: (results: TSearchResultItem[], query: string) => Promise<TSearchResultItem[]>;
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
  private readonly timeoutMs: number;
  private readonly systemPrompt: string;
  private readonly cacheTTL = 3600; // 1 час

  constructor(
    private readonly cacheService: CacheService,
    config: TLLMConfig,
  ) {
    this.apiUrl = botConfig.llmApiUrl;
    this.apiKey = botConfig.llmApiKey;
    this.model = config.model;
    this.maxRetries = config?.maxRetries ?? 2;
    this.timeoutMs = config?.timeoutMs ?? 15000;
    this.systemPrompt = config?.systemPrompt ?? 'Ты - помощник для поиска еды. Reasoning: low';
  }

  public stuctureQuery = async (naturalQuery: string, restaurants: string[]): Promise<TStructuredQuery> => {
    try {
      ConsoleLogger.info('Начинаю структуризацию запроса через LLM', { query: naturalQuery });

      const cacheKey = this.generateCacheKey('transform', naturalQuery, restaurants);
      const cached = await this.cacheService.get<TStructuredQuery>(cacheKey);

      if (cached) {
        ConsoleLogger.info('Найден кэшированный результат структуризации', { query: naturalQuery });
        return cached;
      }

      const prompt = this.buildStructureQueryPrompt(naturalQuery, restaurants);
      const response = await this.callLLM(prompt);
      const structuredQuery = this.parseStructuredQuery(response);

      await this.cacheService.set(cacheKey, structuredQuery, this.cacheTTL);

      ConsoleLogger.info('Запрос успешно структурирован', {
        original: naturalQuery,
        structured: structuredQuery,
      });

      return structuredQuery;
    } catch (error) {
      ConsoleLogger.error('Ошибка структуризации запроса через LLM', error as Error, { query: naturalQuery });
      return this.createFallbackStructuredQuery(naturalQuery);
    }
  };

  public enhanceSearchResults = async (results: TSearchResultItem[], query: string): Promise<TSearchResultItem[]> => {
    try {
      if (results.length === 0) return results;

      ConsoleLogger.info('Начинаю улучшение результатов через LLM', {
        resultsCount: results.length,
        query,
      });

      const cacheKey = this.generateCacheKey('enhance', query, results.length);
      const cached = await this.cacheService.get<TSearchResultItem[]>(cacheKey);

      if (cached) {
        ConsoleLogger.info('Найден кэшированный результат улучшения', { query });
        return cached;
      }

      const prompt = this.buildEnhancementPrompt(results, query);
      const response = await this.callLLM(prompt);
      const enhancedResults = this.parseEnhancedResults(response, results);

      await this.cacheService.set(cacheKey, enhancedResults, this.cacheTTL);

      ConsoleLogger.info('Результаты успешно улучшены', {
        originalCount: results.length,
        enhancedCount: enhancedResults.length,
      });

      return enhancedResults;
    } catch (error) {
      ConsoleLogger.warn('Не удалось улучшить результаты через LLM, возвращаю оригинальные', error as Error);
      return results; // Fallback к оригинальным результатам
    }
  };

  private buildStructureQueryPrompt = (naturalQuery: string, availableRestaurants: string[]): string => {
    return `Ты получаешь:
- naturalQuery — текстовое пожелание пользователя.
- availableRestaurants — список ресторанов (массив строк).

Требования к тегам:
- Каждый смысловой тег в tags и exclusions.tags должен быть представлен в виде из 1 до 3 синонимичных вариантов, например: "острый", "пикант", "чилли"
- Подбирай только реально короткие, используемые в карточках формы. Используй слово-ядро (основу), без окончания и ещё 2–3 наиболее частых синонима или варианты написания для поиска через .includes.
- Если есть только 1 очевидный вариант — используй только его. Если есть 2–3 — укажи все в массиве.
- Для exclusions.tags действуй так же: массивы синонимов для каждого запрета. Используй слово-ядро (основу), без окончания и ещё 2–3 наиболее частых синонима или варианты написания для поиска через .includes.
- Не используй сложные словоформы и длинные выражения.
- Никаких пустых массивов и несуществующих, неочевидных тегов.
- В restaurants и exclusions.restaurants — только рестораны, явно указанные в naturalQuery и присутствующие в availableRestaurants.
- В priceRange/exclusions.priceRange — только если явно названы числа.

Финальная структура (Только JSON, без лишних данных и пустых массивов):

{
  "restaurants"?: string[],
  "tags"?: string[],
  "priceRange"?: {"min": number, "max": number},
  "exclusions"?: {
    "restaurants"?: string[],
    "tags"?: string[],
    "priceRange"?: {"min": number, "max": number}
  }
}

Пример 1
naturalQuery: "Очень острая веган пицца не из Domino’s и без бекона"
availableRestaurants: ["Domino’s", "Dodo", "Papa John’s"]
{
  "tags": ["острый", "пикант", "чилли", "веган", "пост", "безмяс", "пицца"],
  "exclusions": {
    "restaurants": ["Domino’s"],
    "tags": ["бекон", "bacon"]
  }
}

Пример 2
naturalQuery: "Что-нибудь сладкое, до 400, только Burger King"
availableRestaurants: ["Burger King", "KFC"]
{
  "restaurants": ["Burger King"],
  "tags": ["сладкий", "десерт", "сахар"],
  "priceRange": {"min": 0, "max": 400}
}

Пример 3
naturalQuery: "Гриль или азиатское, без майонеза и без лука, до 800"
availableRestaurants: ["SushiShop"]
{
  "tags": ["гриль", "барбекю", "азиат", "суши", "япон"],
  "priceRange": {"min": 0, "max": 800},
  "exclusions": {
    "tags": ["майонез", "лук"]
  }
}

Требуется только JSON по этой схеме для любого нового входа.
Вход:
naturalQuery: "${naturalQuery}"
availableRestaurants: ${JSON.stringify(availableRestaurants)}
`;
  };

  private buildEnhancementPrompt = (menuItems: TSearchResultItem[], naturalQuery: string): string => {
    const menuList = menuItems.map((menuItem, index) =>
      `${index + 1}. ${menuItem.name} (${menuItem.restaurant.name}) - ${menuItem.price}₽`,
    ).join('\n');

    return `Ты - помощник для ранжирования результатов поиска еды.

Оригинальный запрос: "${naturalQuery}"

Найденные блюда:
${menuList}

Проранжируй блюда по релевантности запросу. Верни номера блюд в порядке убывания релевантности, разделенные запятыми. Ограничься 30 блюдами.

Пример ответа: 3,1,5,2,4`;
  };

  private callLLM = async (prompt: string): Promise<string> => {
    const request: TLLMRequest = {
      model: this.model,
      messages: [
        {
          role: 'system',
          content: this.systemPrompt,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1, // Низкая температура для более предсказуемых ответов
      max_tokens: 20000,
    };

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, this.timeoutMs);

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

        ConsoleLogger.debug('LLM ответ получен', {
          tokens: data.usage.total_tokens,
          attempt,
        });

        return data.choices[0].message.content.trim();
      } catch (error) {
        if (attempt === this.maxRetries) {
          throw error;
        }

        ConsoleLogger.warn(`Попытка ${attempt} не удалась, повторяю...`, error as Error);
        await sleep(1000 * attempt); // Exponential backoff
      }
    }

    throw new Error('Все попытки вызова LLM не удались');
  };

  private parseStructuredQuery = (response: string): TStructuredQuery => {
    try {
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

    if (query.tags) {
      repairedQuery.tags = Array.isArray(query.tags)
        ? [...new Set(
            query.tags
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

      if (query.exclusions?.tags) {
        repairedQuery.exclusions.tags = Array.isArray(query.exclusions.tags)
          ? [...new Set(
              query.exclusions.tags
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

  private createFallbackStructuredQuery = (query: string): TStructuredQuery => {
    const tags: string[] = [];

    // Ищем ключевые слова в тексте запроса
    const queryLower = query.toLowerCase();

    if (queryLower.includes('пицц') || queryLower.includes('pizza')) tags.push('пицца');
    if (queryLower.includes('суши') || queryLower.includes('sushi')) tags.push('суши');
    if (queryLower.includes('роллы') || queryLower.includes('rolls')) tags.push('роллы');
    if (queryLower.includes('бургер') || queryLower.includes('burger')) tags.push('бургер');
    if (queryLower.includes('шаурм') || queryLower.includes('shawarma')) tags.push('шаурма');
    if (queryLower.includes('салат') || queryLower.includes('salad')) tags.push('салат');
    if (queryLower.includes('суп') || queryLower.includes('soup')) tags.push('суп');
    if (queryLower.includes('паст') || queryLower.includes('pasta')) tags.push('паста');
    if (queryLower.includes('рыб') || queryLower.includes('fish')) tags.push('рыба');
    if (queryLower.includes('мяс') || queryLower.includes('meat')) tags.push('мясо');
    if (queryLower.includes('веган') || queryLower.includes('vegan')) tags.push('веган');
    if (queryLower.includes('остр') || queryLower.includes('spicy') || queryLower.includes('hot')) tags.push('острый');
    if (queryLower.includes('сладк') || queryLower.includes('sweet')) tags.push('сладкий');

    // Всегда возвращаем объект с tags, даже если массив пустой
    return { tags };
  };

  private parseEnhancedResults = (response: string, originalResults: TSearchResultItem[]): TSearchResultItem[] => {
    try {
      // Извлекаем номера из ответа
      const numbers = response.match(/\d+/g)?.map(Number) || [];

      if (numbers.length === 0) {
        return originalResults;
      }

      // Создаем новый массив с переупорядоченными результатами
      const enhancedResults: TSearchResultItem[] = [];

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
      ConsoleLogger.warn('Ошибка парсинга улучшенных результатов', error as Error);
      return originalResults;
    }
  };

  private generateCacheKey = (type: string, ...params: unknown[]): string => {
    const data = JSON.stringify({ type, params });
    return `llm:${createHash('sha256').update(data).digest('hex')}`;
  };
}
