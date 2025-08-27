import { jsonrepair } from 'jsonrepair';
import { createHash } from 'crypto';

import type { TSearchResultItem, TStructuredQuery } from '@/types/search';
import type { TRestaurant } from '@/types/restaurant';
import type { TCacheService } from '@/services/cacheService/types';

import { sleep } from '@/utils/sleep';
import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { EDishCategory, type TMenuItem } from '@/types/menuItem';
import { environment } from '@/config/environment';

import type {
  TLLMConfig,
  TLLMRequest,
  TLLMResponse,
} from './types';

export class LLMService {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly systemPrompt: string;
  private readonly cacheTTL = 3600; // 1 час

  constructor(
    private readonly cacheService: TCacheService,
    config: TLLMConfig,
  ) {
    this.apiUrl = environment.LLM_API_URL;
    this.apiKey = environment.LLM_API_KEY;
    this.model = config.model;
    this.maxRetries = config?.maxRetries ?? 2;
    this.timeoutMs = config?.timeoutMs ?? 20000;
    this.systemPrompt = config?.systemPrompt ?? 'Ты - помощник для поиска еды. Reasoning: low';
  }

  public stuctureQuery = async (naturalQuery: string, restaurants: TRestaurant[]): Promise<TStructuredQuery> => {
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

Категории блюд (dishCategories):
- основное: основные блюда (бургер, пицца, роллы, суши, стейк, курица, паста, суп, шаурма)
- гарнир: гарниры (картошка, рис, макароны, салат как гарнир, овощи)
- напиток: напитки (кола, сок, чай, кофе, лимонад, вода)
- соус: соусы (кетчуп, майонез, горчица, соус, заправка)
- аксессуар: аксессуары (салфетки, палочки, вилка, ложка, контейнер)

Определяй категории по контексту запроса:
- "хочу поесть" → основное
- "что-нибудь попить" → напиток  
- "гарнир к мясу" → гарнир
- "соус к блюду" → соус
- "салфетки/приборы" → аксессуар

Финальная структура (Только JSON, без лишних данных и пустых массивов):

{
  "restaurants"?: string[],
  "tags"?: string[],
  "priceRange"?: {"min": number, "max": number},
  "dishCategories"?: string[],
  "exclusions"?: {
    "restaurants"?: string[],
    "tags"?: string[],
    "priceRange"?: {"min": number, "max": number},
    "dishCategories"?: string[]
  }
}

Пример 1
naturalQuery: "Очень острая веган пицца не из Domino's и без бекона"
availableRestaurants: ["Domino's", "Dodo", "Papa John's"]
{
  "tags": ["острый", "пикант", "чилли", "веган", "пост", "безмяс", "пицца"],
  "dishCategories": ["main"],
  "exclusions": {
    "restaurants": ["Domino's"],
    "tags": ["бекон", "bacon"]
  }
}

Пример 2
naturalQuery: "Что-нибудь сладкое попить, до 400, только Burger King"
availableRestaurants: ["Burger King", "KFC"]
{
  "restaurants": ["Burger King"],
  "tags": ["сладкий", "десерт", "сахар"],
  "dishCategories": ["drink"],
  "priceRange": {"min": 0, "max": 400}
}

Пример 3
naturalQuery: "Гриль или азиатское основное блюдо, без майонеза и без лука, до 800"
availableRestaurants: ["SushiShop"]
{
  "tags": ["гриль", "барбекю", "азиат", "суши", "япон"],
  "dishCategories": ["main"],
  "priceRange": {"min": 0, "max": 800},
  "exclusions": {
    "tags": ["майонез", "лук"]
  }
}

Пример 4
naturalQuery: "Гарнир к мясу, картошка или рис"
availableRestaurants: ["Ресторан"]
{
  "tags": ["картошка", "картофель", "рис"],
  "dishCategories": ["side"]
}

Требуется только JSON по этой схеме для любого нового входа.
Вход:
naturalQuery: "${naturalQuery}"
availableRestaurants: ${JSON.stringify(availableRestaurants)}
`;
  };

  private buildEnhancementPrompt = (menuItems: TSearchResultItem[], naturalQuery: string): string => {
    const menuList = menuItems.map((menuItem, index) => {
      const category = (menuItem as unknown as TMenuItem).category || 'неизвестно';
      return `${index + 1}. ${menuItem.name} [${category}] - ${menuItem.description ? `- ${menuItem.description.substring(0, 80)}` : ''} - ${menuItem.price}₽`;
    }).join('\n');

    return `Ты эксперт по гастрономии. Тебе дан пользовательский запрос и список блюд с ресторанами, категориями и ценой.
Отсортируй список блюд по степени соответствия пользовательскому запросу, учитывая:

1. КАТЕГОРИЮ БЛЮДА - это самый важный фактор:
   - основное: основные блюда (бургер, пицца, роллы, суши, стейк, курица, паста, суп)
   - гарнир: гарниры (картошка, рис, макароны, салат как гарнир, овощи)
   - напиток: напитки (кола, сок, чай, кофе, лимонад, вода)
   - соус: соусы (кетчуп, майонез, горчица, соус, заправка)
   - аксессуар: аксессуары (салфетки, палочки, вилка, ложка, контейнер)

2. РЕЛЕВАНТНОСТЬ названия блюда к запросу
3. Цену (только если блюда одинаково релевантны)

ПРАВИЛА СОРТИРОВКИ:
- Сначала блюда нужной категории, затем остальные
- Внутри категории - по релевантности названия к запросу
- При равной релевантности - по цене (от дешевого к дорогому)

Запрос пользователя:
"${naturalQuery}"

Список блюд в формате index. Название блюда [категория] - описание блюда (если есть) - цена:
${menuList}

Дай сначала индексы максимально релевантных блюд, затем менее релевантных, внутри каждой группы — по цене.

Отвечай ТОЛЬКО списком индексов в порядке убывания релевантности, не добавляй никаких комментариев, не используй другие символы, кроме запятых: number[]
Если нет релевантных блюд, отвечай пустым массивом: []`;
  };

  private callLLM = async (prompt: string, model?: string, url?: string): Promise<string> => {
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
      max_tokens: 20000,
    };

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, this.timeoutMs);

        const response = await fetch(url ?? this.apiUrl, {
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
  ): Promise<EDishCategory> => {
    try {
      ConsoleLogger.debug('Начинаю категоризацию блюда', { dishName });

      const cacheKey = this.generateCacheKey('categorize', dishName);
      const cached = await this.cacheService.get<EDishCategory>(cacheKey);

      if (cached) {
        ConsoleLogger.debug('Найдена кэшированная категория блюда', { dishName, category: cached });
        return cached;
      }

      const prompt = this.buildCategorizationPrompt(dishName, description, ingredients);
      const response = await this.callLLM(prompt, 'qwen/qwen3-4b-2507', 'http://localhost:1234/v1/chat/completions');
      const category = this.parseCategoryResponse(response);

      // Перманентный кэш (TTL = 0 означает "без истечения")
      await this.cacheService.set(cacheKey, category, 0);

      ConsoleLogger.debug('Блюдо успешно категоризировано', {
        dishName,
        category,
      });

      return category;
    } catch (error) {
      ConsoleLogger.error('Ошибка категоризации блюда, возвращаю MAIN', error as Error, { dishName });
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
