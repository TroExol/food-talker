import { jsonrepair } from 'jsonrepair';
import { createHash } from 'crypto';

import type { TSearchResultItem, TStructuredQuery } from '@/types/search';
import type { TRestaurant } from '@/types/restaurant';
import type { NeuralRequestLoggingService } from '@/services/NeuralRequestLoggingService/NeuralRequestLoggingService';
import type { TCacheService } from '@/services/cacheService/types';

import { sleep } from '@/utils/sleep';
import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { ENeuralRequestType } from '@/types/neuralRequestLogging';
import { EDishCategory, type TMenuItem } from '@/types/menuItem';
import { environment } from '@/config/environment';

import type {
  TLLMConfig,
  TLLMParams,
  TLLMRequest,
  TLLMResponse,
} from './types';

export class LLMService {
  private readonly apiBaseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly systemPrompt: string;
  private readonly cacheTTL = 3600; // 1 час

  constructor(
    private readonly cacheService: TCacheService,
    private readonly neuralRequestLoggingService: NeuralRequestLoggingService,
    config: TLLMConfig,
  ) {
    this.apiBaseUrl = environment.LLM_API_BASE_URL;
    this.apiKey = environment.LLM_API_KEY;
    this.model = config.model;
    this.maxRetries = config?.maxRetries ?? 2;
    this.timeoutMs = config?.timeoutMs ?? 20000;
    this.systemPrompt = config?.systemPrompt ?? 'Ты - помощник для поиска еды. Reasoning: low';
  }

  public stuctureQuery = async (
    naturalQuery: string,
    restaurants: TRestaurant[],
    userTelegramId?: number,
  ): Promise<TStructuredQuery> => {
    try {
      ConsoleLogger.info('Начинаю структуризацию запроса через LLM', { query: naturalQuery });

      const cacheKey = this.generateCacheKey(
        'transform',
        naturalQuery,
        restaurants.map(r => r.id).join(','),
      );
      const cached = await this.cacheService.get<TStructuredQuery>(cacheKey);

      if (cached) {
        ConsoleLogger.info('Найден кэшированный результат структуризации', { query: naturalQuery });
        return cached;
      }

      const prompt = this.buildStructureQueryPrompt(naturalQuery, restaurants.map(r => r.name));
      const response = await this.callLLMWithLogging(
        prompt,
        '/v1/chat/completions',
        ENeuralRequestType.LLM_STRUCTURE_QUERY,
        userTelegramId,
        'yandex/YandexGPT-5-Lite-8B-instruct-GGUF',
        {
          temperature: 0.4,
          max_tokens: 5000,
        },
      );
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

  public enhanceSearchResults = async (
    results: TSearchResultItem[],
    query: string,
    userTelegramId?: number,
    model?: string,
  ): Promise<TSearchResultItem[]> => {
    try {
      if (results.length === 0) return results;

      ConsoleLogger.info('Начинаю улучшение результатов через LLM', {
        resultsCount: results.length,
        query,
      });

      const cacheKey = this.generateCacheKey(
        'enhance',
        query,
        results.map(r => `${r.restaurant.id}:${r.id}`),
      );
      const cached = await this.cacheService.get<TSearchResultItem[]>(cacheKey);

      if (cached) {
        ConsoleLogger.info('Найден кэшированный результат улучшения', { query });
        return cached;
      }

      const prompt = this.buildEnhancementPrompt(results, query);

      const response = await this.callLLMWithLogging(
        prompt,
        '/v1/chat/completions',
        ENeuralRequestType.LLM_ENHANCE_RESULTS,
        userTelegramId,
        model,
        {
          temperature: 0.1,
          max_tokens: 20000,
        },
      );
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
    return `СИСТЕМА СТРУКТУРИРОВАНИЯ ЗАПРОСОВ ПОЛЬЗОВАТЕЛЯ

ВХОДНЫЕ ДАННЫЕ:
- naturalQuery — запрос пользователя
- availableRestaurants — доступные рестораны

КРИТИЧЕСКИ ВАЖНО - ПРАВИЛА БЕЗ ИСКЛЮЧЕНИЙ:
1. НИКОГДА не добавляйте рестораны в restaurants, если они НЕ УПОМЯНУТЫ в naturalQuery
2. restaurants содержит ТОЛЬКО рестораны, которые пользователь ЯВНО назвал и которые есть в availableRestaurants
3. Если пользователь просит "пицца" без названия ресторана - restaurants должен быть ПУСТ
4. НЕ предлагайте и НЕ угадывайте рестораны по типу блюда

АЛГОРИТМ ОБРАБОТКИ:
Шаг 1: Найти ЯВНЫЕ упоминания ресторанов
- Искать только точные названия из availableRestaurants
- Добавлять в restaurants ТОЛЬКО найденные совпадения

Шаг 2: Извлечь теги блюд
- Создать 1-3 синонима для каждого смыслового элемента
- Использовать основы слов без окончаний

Шаг 3: Определить категорию блюда
- основное: бургер, пицца, роллы, суши, стейк, курица, паста, суп, шаурма
- гарнир: картошка, рис, макароны, салат как гарнир, овощи  
- напиток: кола, сок, чай, кофе, лимонад, вода
- соус: кетчуп, майонез, горчица, соус, заправка
- аксессуар: салфетки, палочки, вилка, ложка, контейнер

Определяй категории по контексту запроса:
- "хочу поесть" → основное
- "что-нибудь попить" → напиток  
- "гарнир к мясу" → гарнир
- "соус к блюду" → соус
- "салфетки/приборы" → аксессуар

Шаг 4: Найти ограничения и исключения
- "не из", "кроме" → exclusions.restaurants
- "без", "не хочу" → exclusions.tags
- "до X рублей" → priceRange.max

ОБЯЗАТЕЛЬНЫЕ ПРИМЕРЫ:

Пример 1 - БЕЗ ресторанов:
naturalQuery: "бургер"
availableRestaurants: ["McDonald's", "Burger King", "KFC"]
РЕЗУЛЬТАТ:
{
  "tags": ["бургер", "burger"],
  "category": "основное"
}

Пример 2 - С рестораном:
naturalQuery: "хочу пиццу из Domino's"
availableRestaurants: ["Domino's", "Dodo", "Papa John's"]
РЕЗУЛЬТАТ:
{
  "restaurants": ["Domino's"],
  "tags": ["пицца", "pizza"],
  "category": "основное"
}

Пример 3 - Исключения:
naturalQuery: "острая пицца не из McDonald's"
availableRestaurants: ["McDonald's", "Domino's", "Dodo"]
РЕЗУЛЬТАТ:
{
  "tags": ["острый", "пикант", "пицца", "pizza"],
  "category": "основное",
  "exclusions": {
    "restaurants": ["McDonald's"]
  }
}

ФИНАЛЬНАЯ СХЕМА (только валидный JSON):
{
  "restaurants"?: string[],
  "tags"?: string[],
  "priceRange"?: {"min": number, "max": number},
  "category"?: string,
  "exclusions"?: {
    "restaurants"?: string[],
    "tags"?: string[],
    "priceRange"?: {"min": number, "max": number},
    "category"?: string
  }
}

ВХОДНОЙ ЗАПРОС:
naturalQuery: "${naturalQuery}"
availableRestaurants: ${JSON.stringify(availableRestaurants)}

ВЕРНИ ТОЛЬКО JSON БЕЗ ДОПОЛНИТЕЛЬНОГО ТЕКСТА.`;
  };

  private buildEnhancementPrompt = (menuItems: TSearchResultItem[], naturalQuery: string): string => {
    const menuList = menuItems.map((menuItem, index) => {
      const category = (menuItem as unknown as TMenuItem).category || 'неизвестно';
      return `${index + 1}. ${menuItem.name} [${category}] - ${menuItem.description ? `- ${menuItem.description.substring(0, 80)}` : ''} - ${menuItem.price}₽`;
    }).join('\n');

    return `СИСТЕМА РАНЖИРОВАНИЯ БЛЮД ПО РЕЛЕВАНТНОСТИ

Ты эксперт по анализу соответствия блюд пользовательским запросам. Твоя задача — ранжировать список блюд по степени соответствия запросу пользователя.

КРИТЕРИИ ОЦЕНКИ (по приоритету):

1. КАТЕГОРИАЛЬНОЕ СООТВЕТСТВИЕ (Вес: 60%):
   - Полное соответствие категории: 100 баллов
   - Частичное соответствие (смежная категория): 50 баллов  
   - Несоответствие категории: 0 баллов

2. СЕМАНТИЧЕСКОЕ СООТВЕТСТВИЕ НАЗВАНИЯ (Вес: 40%):
   - Точное совпадение ключевых слов: 100 баллов
   - Синонимы или близкие понятия: 75 баллов
   - Общая тематика (например, "мясное" для "стейк"): 50 баллов
   - Упоминание основных ингредиентов: 25 баллов
   - Отсутствие связи: 0 баллов

3. ЦЕНОВОЙ ФАКТОР (только при равных баллах):
   - Более дешевые блюда получают приоритет

КАТЕГОРИИ БЛЮД:
- основное: бургер, пицца, роллы, суши, стейк, курица, паста, суп, шаурма, плов, лазанья
- гарнир: картошка, рис, макароны, салат как гарнир, овощи, хлеб
- напиток: кола, сок, чай, кофе, лимонад, вода, коктейль, смузи
- соус: кетчуп, майонез, горчица, соус, заправка, дип
- аксессуар: салфетки, палочки, вилка, ложка, контейнер, упаковка

АЛГОРИТМ РАНЖИРОВАНИЯ:
1. Определи основную категорию из пользовательского запроса
2. Для каждого блюда рассчитай:
   - Балл категории (0-100)
   - Балл семантического соответствия (0-100)
   - Итоговый балл = (Категория × 0.6) + (Семантика × 0.4)
3. Сортируй по убыванию итогового балла
4. При равных баллах — сортируй по возрастанию цены

ПРИМЕРЫ ОЦЕНКИ:

Запрос: "острая пицца"
- "Пицца Пепперони острая" → Категория: 100, Семантика: 100, Итого: 100
- "Пицца Маргарита" → Категория: 100, Семантика: 75, Итого: 90  
- "Острые крылышки" → Категория: 0, Семантика: 50, Итого: 20
- "Суп харчо" → Категория: 0, Семантика: 0, Итого: 0

Запрос: "что-то сладкое попить"
- "Кока-кола" → Категория: 100, Семантика: 75, Итого: 90
- "Сок яблочный" → Категория: 100, Семантика: 50, Итого: 80
- "Чай черный" → Категория: 100, Семантика: 25, Итого: 70
- "Пицца" → Категория: 0, Семантика: 0, Итого: 0

ВХОДНЫЕ ДАННЫЕ:
Запрос пользователя: "${naturalQuery}"

Список блюд:
${menuList}

ИНСТРУКЦИЯ ПО ВЫВОДУ:
1. НЕ показывай промежуточные расчеты
2. НЕ добавляй комментарии или объяснения  
3. Верни ТОЛЬКО массив индексов в формате: [number, number, ...]
4. Сортируй строго по убыванию релевантности
5. Если нет релевантных блюд (все получили 0 баллов) → верни: []

РЕЗУЛЬТАТ:`;
  };

  private callLLMWithLogging = async (
    prompt: string,
    url: string,
    requestType: ENeuralRequestType,
    userTelegramId?: number,
    model?: string,
    params?: TLLMParams,
  ): Promise<string> => {
    const startTime = Date.now();

    const request: TLLMRequest = {
      model: model ?? this.model,
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
      params: {
        temperature: 0.1,
        max_tokens: 11000,
        ...params,
      },
    };

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, this.timeoutMs);

        const response = await fetch(`${this.apiBaseUrl}${url}`, {
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

        // Логируем случай с пустым ответом
        const processingTime = Date.now() - startTime;

        if (!data.choices?.[0]?.message?.content) {
          await this.neuralRequestLoggingService.logRequest({
            userTelegramId,
            requestType,
            model: request.model,
            inputTokens: data.usage?.prompt_tokens || 0,
            outputTokens: data.usage?.completion_tokens || 0,
            totalTokens: data.usage?.total_tokens || 0,
            requestData: {
              prompt,
              model: request.model,
              temperature: request.params?.temperature,
              max_tokens: request.params?.max_tokens,
              system_prompt: this.systemPrompt,
              attempt: attempt + 1,
            },
            responseData: {
              reasoning: data.choices[0].message.reasoning,
              error: 'Пустой ответ от LLM',
              usage: data.usage,
              attempt: attempt + 1,
            },
            processingTimeMs: processingTime,
          });

          throw new Error('Пустой ответ от LLM');
        }

        await this.neuralRequestLoggingService.logRequest({
          userTelegramId,
          requestType,
          model: request.model,
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
          requestData: {
            prompt,
            model: request.model,
            temperature: request.params?.temperature,
            max_tokens: request.params?.max_tokens,
            system_prompt: this.systemPrompt,
          },
          responseData: {
            content: data.choices[0].message.content,
            reasoning: data.choices[0].message.reasoning,
            usage: data.usage,
          },
          processingTimeMs: processingTime,
        });

        ConsoleLogger.debug('LLM ответ получен', {
          tokens: data.usage.total_tokens,
          attempt,
        });

        return data.choices[0].message.content.trim();
      } catch (error) {
        // Логируем неудачную попытку
        const processingTime = Date.now() - startTime;

        await this.neuralRequestLoggingService.logRequest({
          userTelegramId,
          requestType,
          model: request.model,
          inputTokens: 0, // Не можем определить без успешного ответа
          outputTokens: 0,
          totalTokens: 0,
          requestData: {
            prompt,
            model: request.model,
            temperature: request.params?.temperature,
            max_tokens: request.params?.max_tokens,
            system_prompt: this.systemPrompt,
            attempt: attempt + 1,
          },
          responseData: {
            error: error instanceof Error ? error.message : String(error),
            attempt: attempt + 1,
          },
          processingTimeMs: processingTime,
        });

        if (attempt === this.maxRetries) {
          throw error;
        }

        ConsoleLogger.warn(`Попытка ${attempt + 1} не удалась, повторяю...`, error as Error);
        await sleep(1000 * attempt);
      }
    }

    throw new Error('Все попытки вызова LLM не удались');
  };

  private callLLM = async (
    prompt: string,
    url: string,
    model?: string,
    params?: TLLMParams,
  ): Promise<string> => {
    const request: TLLMRequest = {
      model: model ?? this.model,
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
      max_tokens: 11000,
      ...params,
    };

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, this.timeoutMs);

        const response = await fetch(`${this.apiBaseUrl}${url}`, {
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
          ConsoleLogger.warn('Получен пустой ответ от LLM', {
            usage: data.usage,
            attempt,
          });
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

        ConsoleLogger.warn(`Попытка ${attempt + 1} не удалась, повторяю...`, error as Error);
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
      if (typeof query.priceRange.min === 'number' || typeof query.priceRange.max === 'number') {
        repairedQuery.priceRange = {
          min: query.priceRange.min ?? 0,
          max: query.priceRange.max ?? Number.MAX_SAFE_INTEGER,
        };
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

    if (query.category) {
      repairedQuery.category = query.category.toLowerCase().trim() as EDishCategory;
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
        if (typeof query.exclusions.priceRange.min === 'number' || typeof query.exclusions.priceRange.max === 'number') {
          repairedQuery.exclusions.priceRange = {
            min: query.exclusions.priceRange.min ?? 0,
            max: query.exclusions.priceRange.max ?? Number.MAX_SAFE_INTEGER,
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

      if (query.exclusions?.category) {
        repairedQuery.exclusions.category = query.exclusions.category.toLowerCase().trim() as EDishCategory;
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
        return [];
      }

      // Создаем новый массив с переупорядоченными результатами
      const enhancedResults: TSearchResultItem[] = [];

      for (const number of numbers) {
        const index = number - 1; // Нумерация с 1
        if (index >= 0 && index < originalResults.length) {
          enhancedResults.push(originalResults[index]);
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

  public categorizeDish = async (
    dishName: string,
    description?: string,
    ingredients?: string[],
    userTelegramId?: number,
  ): Promise<EDishCategory> => {
    try {
      ConsoleLogger.debug('Начинаю категоризацию блюда', { dishName });

      const cacheKey = this.generateCacheKey('categorize', dishName, description, ingredients);
      const cached = await this.cacheService.get<EDishCategory>(cacheKey);

      if (cached) {
        ConsoleLogger.debug('Найдена кэшированная категория блюда', { dishName, description, ingredients, category: cached });
        return cached;
      }

      const prompt = this.buildCategorizationPrompt(dishName, description, ingredients);
      const response = await this.callLLMWithLogging(
        prompt,
        '/v1/chat/completions',
        ENeuralRequestType.LLM_CATEGORIZE_DISHES,
        userTelegramId,
        'yandex/YandexGPT-5-Lite-8B-instruct-GGUF',
        {
          temperature: 0.2,
          max_tokens: 2000,
        },
      );
      const category = this.parseCategoryResponse(response);

      // Перманентный кэш (TTL = 0 означает "без истечения")
      await this.cacheService.set(cacheKey, category, 0);

      ConsoleLogger.debug('Блюдо успешно категоризировано', {
        dishName,
        description,
        ingredients,
        category,
      });

      return category;
    } catch (error) {
      ConsoleLogger.error('Ошибка категоризации блюда, возвращаю MAIN', error as Error, { dishName, description, ingredients });
      return EDishCategory.MAIN; // Fallback к основной категории
    }
  };

  private buildCategorizationPrompt = (dishName: string, description?: string, ingredients?: string[]): string => {
    return `Ты эксперт по гастрономии. Определи категорию блюда по названию.

Категории:
- основное: основные блюда (бургер, пицца, роллы, суши, стейк, курица, паста, суп)
- гарнир: гарниры (картошка, рис, макароны, салат как гарнир, овощи)
- напиток: напитки (кола, сок, чай, кофе, лимонад, вода)
- соус: соусы (кетчуп, майонез, горчица, соус, заправка)
- аксессуар: аксессуары (салфетки, палочки, вилка, ложка, контейнер)

Правила:
1. Если блюдо содержит мясо/рыбу/морепродукты - это основное
2. Если это жидкое и пьется - это напиток
3. Если это приправа/заправка - это соус
4. Если это столовые приборы/упаковка - это аксессуар
5. Если это дополнение к основному блюду - это гарнир

Название блюда: "${dishName}"
Описание блюда: "${description}"
Ингредиенты блюда: "${ingredients?.join(', ')}"

Ответь только одной категорией: основное/гарнир/напиток/соус/аксессуар`;
  };

  private parseCategoryResponse = (response: string): EDishCategory => {
    const cleanResponse = response.trim().toLowerCase();

    switch (cleanResponse) {
      case 'аксессуар':
        return EDishCategory.ACCESSORY;
      case 'гарнир':
        return EDishCategory.SIDE;
      case 'напиток':
        return EDishCategory.DRINK;
      case 'основное':
        return EDishCategory.MAIN;
      case 'соус':
        return EDishCategory.SAUCE;
      default:
        ConsoleLogger.warn('Неизвестная категория от LLM, возвращаю MAIN', { response: cleanResponse });
        return EDishCategory.MAIN;
    }
  };
}
