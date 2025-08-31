import type { Mock } from 'vitest';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TSearchResultItem, TStructuredQuery } from '@/types/search';
import type { NeuralRequestLoggingService } from '@/services/NeuralRequestLoggingService/NeuralRequestLoggingService';
import type { CacheService } from '@/services/cacheService/CacheService';

import { EDishCategory } from '@/types/menuItem';

import { LLMService } from './LLMService';

// Мокируем fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LLMService', () => {
  let llmService: LLMService;
  let mockCacheService: CacheService;
  let mockNeuralRequestLoggingService: NeuralRequestLoggingService;

  beforeEach(() => {
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      has: vi.fn(),
      getStats: vi.fn(),
      close: vi.fn(),
    } as unknown as CacheService;

    mockNeuralRequestLoggingService = {
      logRequest: vi.fn().mockResolvedValue({}),
      getUserTokenStats: vi.fn(),
      getUserTokenStatsByType: vi.fn(),
      getRecentLogs: vi.fn(),
    } as unknown as NeuralRequestLoggingService;

    llmService = new LLMService(mockCacheService, mockNeuralRequestLoggingService, {
      cacheTTL: 1800,
    });
  });

  describe('transformQuery', () => {
    it('должен успешно трансформировать запрос в структурированный JSON', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '{"tags": ["пицца", "сыр"], "priceRange": {"min": 200, "max": 800}}',
          },
        }],
        usage: {
          total_tokens: 150,
          prompt_tokens: 100,
          completion_tokens: 50,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await llmService.stuctureQuery('хочу пиццу с сыром до 800 рублей', []);

      expect(result).toEqual({
        tags: ['пицца', 'сыр'],
        priceRange: { min: 200, max: 800 },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'test-llm-api-url/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-llm-api-key',
            'Content-Type': 'application/json',
            'X-Title': 'Food Talker Bot',
          },
          body: expect.stringContaining('хочу пиццу с сыром до 800 рублей') as string,
        }),
      );
    });

    it('должен обрабатывать запросы с ресторанами и исключениями', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: `{
              "restaurants": ["Додо Пицца", "Папа Джонс"],
              "tags": ["пепперони"],
              "exclusions": {
                "tags": ["ананас"],
                "priceRange": {"min": 0, "max": 300}
              }
            }`,
          },
        }],
        usage: { total_tokens: 100, prompt_tokens: 80, completion_tokens: 20 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await llmService.stuctureQuery(
        'пепперони из Додо или Папа Джонс, но без ананаса и не дороже 300',
        [
          { id: '1', name: 'Додо Пицца', coordinates: { latitude: 0, longitude: 0 }, lastUpdated: new Date() },
          { id: '2', name: 'Папа Джонс', coordinates: { latitude: 0, longitude: 0 }, lastUpdated: new Date() },
        ],
      );

      expect(result).toEqual({
        restaurants: ['додо пицца', 'папа джонс'],
        tags: ['пепперони'],
        exclusions: {
          tags: ['ананас'],
          priceRange: { min: 0, max: 300 },
        },
      });
    });

    it('должен обрабатывать запросы при неверной структуре JSON', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '{"invalid": "structure"}',
          },
        }],
        usage: { total_tokens: 50, prompt_tokens: 30, completion_tokens: 20 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await llmService.stuctureQuery('тест', []);

      expect(result).toEqual({});
    });

    it('должен повторять попытки при ошибках сети', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { content: '{"tags": ["тест"]}' } }],
            usage: { total_tokens: 50, prompt_tokens: 30, completion_tokens: 20 },
          }),
        });

      const fetching = llmService.stuctureQuery('тест', []);
      await vi.advanceTimersToNextTimerAsync();
      await vi.advanceTimersToNextTimerAsync();
      const result = await fetching;

      expect(result).toEqual({ tags: ['тест'] });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('должен возвращать fallback запрос при превышении лимита попыток', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const structuring = llmService.stuctureQuery('тест', []);
      await vi.advanceTimersToNextTimerAsync();
      await vi.advanceTimersToNextTimerAsync();

      const result = await structuring;

      expect(result).toEqual({ tags: [] });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('должен обрабатывать таймауты', async () => {
      const llmService = new LLMService(mockCacheService, mockNeuralRequestLoggingService, {
        maxRetries: 0,
        timeoutMs: 10000,
      });

      const onAbort = vi.fn();
      // Мокаем fetch чтобы он никогда не резолвился
      mockFetch.mockImplementation((url: string, options: { signal: AbortSignal }) => new Promise(resolve => {
        options.signal.onabort = () => {
          onAbort();
          resolve(void 0);
        };
      }));

      const structuring = llmService.stuctureQuery('тест', []);
      await vi.advanceTimersByTimeAsync(10000);
      const result = await structuring;

      expect(result).toEqual({ tags: [] });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(onAbort).toHaveBeenCalledTimes(1);
    });
  });

  describe('enhanceSearchResults', () => {
    const mockResults: TSearchResultItem[] = [
      {
        id: '1',
        name: 'Пицца Маргарита',
        restaurant: { id: '1', name: 'Додо Пицца' },
        description: 'Классическая пицца',
        tags: ['тесто', 'сыр', 'томаты'],
        price: 500,
        orderUrl: 'https://example.com/1',
        category: EDishCategory.MAIN,
        image: 'https://example.com/1',
        available: true,
      },
      {
        id: '2',
        name: 'Пицца Пепперони',
        restaurant: { id: '1', name: 'Додо Пицца' },
        description: 'Острая пицца',
        tags: ['тесто', 'сыр', 'пепперони'],
        price: 600,
        orderUrl: 'https://example.com/2',
        category: EDishCategory.MAIN,
        image: 'https://example.com/2',
        available: true,
      },
    ];

    it('должен успешно улучшать результаты поиска', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '2,1',
          },
        }],
        usage: { total_tokens: 50, prompt_tokens: 30, completion_tokens: 20 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await llmService.enhanceSearchResults(mockResults, 'острая пицца');

      expect(result).toEqual([mockResults[1], mockResults[0]]);
    });

    it('должен возвращать оригинальные результаты при ошибке', async () => {
      const llmService = new LLMService(mockCacheService, mockNeuralRequestLoggingService, {
        maxRetries: 0,
      });

      mockFetch.mockRejectedValue(new Error('LLM error'));

      const result = await llmService.enhanceSearchResults(mockResults, 'тест');

      expect(result).toEqual(mockResults);
    });

    it('должен возвращать пустой массив при пустых результатах', async () => {
      const result = await llmService.enhanceSearchResults([], 'тест');

      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('должен обрабатывать некорректный ответ LLM', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'некорректный ответ',
          },
        }],
        usage: { total_tokens: 50, prompt_tokens: 30, completion_tokens: 20 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await llmService.enhanceSearchResults(mockResults, 'тест');

      expect(result).toEqual([]);
    });
  });

  describe('parseStructuredQuery', () => {
    type MockLLMService = {
      parseStructuredQuery: (availableRestaurants: string[], response: string) => TStructuredQuery;
    };

    it('должен извлекать JSON из ответа с дополнительным текстом', () => {
      const response = 'Вот структурированный запрос: {"tags": ["пицца"]} Спасибо!';

      const result = (llmService as unknown as MockLLMService).parseStructuredQuery([], response);

      expect(result).toEqual({ tags: ['пицца'] });
    });

    it('должен извлекать JSON из ответа с дополнительным текстом и новой строкой', () => {
      const response = `Вот структурированный запрос:
      {
        "tags": ["пицца"]
      }
      Спасибо!`;

      const result = (llmService as unknown as MockLLMService).parseStructuredQuery([], response);

      expect(result).toEqual({ tags: ['пицца'] });
    });

    it('должен выбрасывать ошибку при отсутствии JSON', () => {
      const response = 'Просто текст без JSON';

      expect(() => (llmService as unknown as MockLLMService).parseStructuredQuery([], response)).toThrow('Ошибка парсинга JSON');
    });

    it('должен фильтровать неверные типы данных', () => {
      const response = '{"restaurants": ["Додо", 123, null], "tags": ["пицца", 456]}';

      const result = (llmService as unknown as MockLLMService).parseStructuredQuery(['Додо'], response);

      expect(result).toEqual({
        restaurants: ['додо'],
        tags: ['пицца'],
      });
    });
  });

  describe('parseEnhancedResults', () => {
    type MockLLMService = {
      parseEnhancedResults: (response: string, results: TSearchResultItem[]) => TSearchResultItem[];
    };

    const mockResults: TSearchResultItem[] = [
      {
        id: '1',
        name: 'Блюдо 1',
        restaurant: { id: '1', name: 'Ресторан 1' },
        description: '',
        tags: [],
        price: 100,
        orderUrl: '',
        category: EDishCategory.MAIN,
        image: 'https://example.com/1',
        available: true,
      },
      {
        id: '2',
        name: 'Блюдо 2',
        restaurant: { id: '1', name: 'Ресторан 1' },
        description: '',
        tags: [],
        price: 200,
        orderUrl: '',
        category: EDishCategory.MAIN,
        image: 'https://example.com/2',
        available: true,
      },
      {
        id: '3',
        name: 'Блюдо 3',
        restaurant: { id: '1', name: 'Ресторан 1' },
        description: '',
        tags: [],
        price: 300,
        orderUrl: '',
        category: EDishCategory.MAIN,
        image: 'https://example.com/3',
        available: true,
      },
    ];

    it('должен переупорядочивать результаты по номерам', () => {
      const response = '3,1,2';

      const result = (llmService as unknown as MockLLMService).parseEnhancedResults(response, mockResults);

      expect(result).toEqual([mockResults[2], mockResults[0], mockResults[1]]);
    });

    it('не должен добавлять оставшиеся результаты в конец', () => {
      const response = '2';

      const result = (llmService as unknown as MockLLMService).parseEnhancedResults(response, mockResults);

      expect(result).toEqual([mockResults[1]]);
    });

    it('не должен возвращать оригинальные результаты при пустом ответе', () => {
      const response = '';

      const result = (llmService as unknown as MockLLMService).parseEnhancedResults(response, mockResults);

      expect(result).toEqual([]);
    });

    it('должен игнорировать некорректные номера', () => {
      const response = '2,999,1';

      const result = (llmService as unknown as MockLLMService).parseEnhancedResults(response, mockResults);

      expect(result).toEqual([mockResults[1], mockResults[0]]);
    });
  });

  describe('repairQueryStructure', () => {
    type MockLLMService = {
      repairQueryStructure: (availableRestaurants: string[], query: TStructuredQuery) => TStructuredQuery;
    };

    it('должен нормализовать и удалять дубликаты в ресторанах', () => {
      const query: TStructuredQuery = {
        restaurants: ['Додо Пицца', 'додо пицца', 'ДОДО ПИЦЦА', 'Папа Джонс', 'вввв'],
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(['Додо Пицца', 'Папа Джонс'], query);

      expect(result).toEqual({
        restaurants: ['додо пицца', 'папа джонс'],
      });
    });

    it('должен нормализовать и удалять дубликаты в ингредиентах', () => {
      const query: TStructuredQuery = {
        tags: ['Пицца', 'пицца', 'Сыр', 'сыр', 'Томаты'],
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(['Додо Пицца', 'Папа Джонс'], query);

      expect(result).toEqual({
        tags: ['пицца', 'сыр', 'томаты'],
      });
    });

    it('должен исправлять некорректные типы данных в ресторанах', () => {
      const query = {
        restaurants: ['Додо', 123, null, 'Папа Джонс', undefined, ''],
      } as TStructuredQuery;

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(['Додо Пицца', 'Папа Джонс'], query);

      expect(result).toEqual({
        restaurants: ['папа джонс'],
      });
    });

    it('должен исправлять некорректные типы данных в ингредиентах', () => {
      const query = {
        tags: ['Пицца', 456, null, 'Сыр', undefined, ''],
      } as TStructuredQuery;

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(['Додо Пицца', 'Папа джонс'], query);

      expect(result).toEqual({
        tags: ['пицца', 'сыр'],
      });
    });

    it('должен исправлять отрицательные цены в ценовом диапазоне', () => {
      const query: TStructuredQuery = {
        priceRange: { min: -100, max: 500 },
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(['Додо Пицца', 'Папа джонс'], query);

      expect(result).toEqual({
        priceRange: { min: 0, max: 500 },
      });
    });

    it('должен исправлять отрицательные максимальные цены', () => {
      const query: TStructuredQuery = {
        priceRange: { min: 100, max: -50 },
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(['Додо Пицца', 'Папа джонс'], query);

      expect(result).toEqual({
        priceRange: { min: 100, max: Number.MAX_SAFE_INTEGER },
      });
    });

    it('должен исправлять диапазон где min > max', () => {
      const query: TStructuredQuery = {
        priceRange: { min: 500, max: 100 },
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(['Додо Пицца', 'Папа джонс'], query);

      expect(result).toEqual({
        priceRange: { min: 0, max: 100 },
      });
    });

    it('должен обрабатывать исключения с ресторанами', () => {
      const query: TStructuredQuery = {
        tags: ['пицца'],
        exclusions: {
          restaurants: ['Додо Пицца', 'додо пицца', 'Папа Джонс'],
        },
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(['Додо Пицца', 'Папа джонс'], query);

      expect(result).toEqual({
        tags: ['пицца'],
        exclusions: {
          restaurants: ['додо пицца', 'папа джонс'],
        },
      });
    });

    it('должен обрабатывать исключения с ингредиентами', () => {
      const query: TStructuredQuery = {
        tags: ['пицца'],
        exclusions: {
          tags: ['Ананас', 'ананас', 'Оливки'],
        },
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(['Додо Пицца', 'Папа джонс'], query);

      expect(result).toEqual({
        tags: ['пицца'],
        exclusions: {
          tags: ['ананас', 'оливки'],
        },
      });
    });

    it('должен исправлять ценовые диапазоны в исключениях', () => {
      const query: TStructuredQuery = {
        tags: ['пицца'],
        exclusions: {
          priceRange: { min: -50, max: 300 },
        },
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(['Додо Пицца', 'Папа джонс'], query);

      expect(result).toEqual({
        tags: ['пицца'],
        exclusions: {
          priceRange: { min: 0, max: 300 },
        },
      });
    });

    it('должен исправлять некорректные ценовые диапазоны в исключениях', () => {
      const query: TStructuredQuery = {
        tags: ['пицца'],
        exclusions: {
          priceRange: { min: 500, max: 100 },
        },
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(['Додо Пицца', 'Папа джонс'], query);

      expect(result).toEqual({
        tags: ['пицца'],
        exclusions: {
          priceRange: { min: 0, max: 100 },
        },
      });
    });

    it('должен обрабатывать пустые массивы', () => {
      const query: TStructuredQuery = {
        restaurants: [],
        tags: [],
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(['Додо Пицца', 'Папа джонс'], query);

      expect(result).toEqual({
        restaurants: [],
        tags: [],
      });
    });

    it('должен обрабатывать пустую структуру', () => {
      const query: TStructuredQuery = {};

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(['Додо Пицца', 'Папа джонс'], query);

      expect(result).toEqual({});
    });

    it('должен обрабатывать сложную структуру с множественными исправлениями', () => {
      const query = {
        restaurants: ['Додо Пицца', 123, 'додо', 'Папа Джонс'],
        tags: ['Пицца', null, 'пицца', 'Сыр'],
        priceRange: { min: -100, max: -50 },
        exclusions: {
          restaurants: ['Додо Пицца', undefined, 'додо'],
          tags: ['Ананас', 456, 'ананас'],
          priceRange: { min: 500, max: 100 },
        },
      } as TStructuredQuery;

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(['Додо Пицца', 'Папа джонс'], query);

      expect(result).toEqual({
        restaurants: ['додо пицца', 'папа джонс'],
        tags: ['пицца', 'сыр'],
        priceRange: { min: 0, max: Number.MAX_SAFE_INTEGER },
        exclusions: {
          restaurants: ['додо пицца'],
          tags: ['ананас'],
          priceRange: { min: 0, max: 100 },
        },
      });
    });
  });

  describe('Cache', () => {
    describe('transformQuery with cache', () => {
      it('должен использовать кэшированный результат при наличии', async () => {
        const cachedQuery: TStructuredQuery = {
          tags: ['пицца', 'сыр'],
          priceRange: { min: 200, max: 800 },
        };

        mockCacheService.get = vi.fn().mockResolvedValue(cachedQuery);

        const result = await llmService.stuctureQuery(
          'хочу пиццу с сыром до 800 рублей',
          [{ id: '1', name: 'Додо', coordinates: { latitude: 0, longitude: 0 }, lastUpdated: new Date() }],
        );

        expect(result).toEqual(cachedQuery);
        expect(mockCacheService.get).toHaveBeenCalledWith(expect.stringMatching(/^llm:/));
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('должен сохранять результат в кэш при отсутствии кэша', async () => {
        mockCacheService.get = vi.fn().mockResolvedValue(null);
        mockCacheService.set = vi.fn().mockResolvedValue(undefined);

        const mockResponse = {
          choices: [{
            message: {
              content: '{"tags": ["пицца", "сыр"], "priceRange": {"min": 200, "max": 800}}',
            },
          }],
          usage: { total_tokens: 150, prompt_tokens: 100, completion_tokens: 50 },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await llmService.stuctureQuery(
          'хочу пиццу с сыром до 800 рублей',
          [{ id: '1', name: 'Додо', coordinates: { latitude: 0, longitude: 0 }, lastUpdated: new Date() }],
        );

        expect(mockCacheService.set).toHaveBeenCalledWith(
          expect.stringMatching(/^llm:/),
          expect.objectContaining({
            tags: ['пицца', 'сыр'],
            priceRange: { min: 200, max: 800 },
          }),
          3600,
        );
      });

      it('должен работать без кэша если cacheService не передан', async () => {
        const llmServiceWithoutCache = new LLMService(mockCacheService, mockNeuralRequestLoggingService, {
          cacheTTL: 1800, // 30 минут
        });

        const mockResponse = {
          choices: [{
            message: {
              content: '{"tags": ["пицца"]}',
            },
          }],
          usage: { total_tokens: 50, prompt_tokens: 30, completion_tokens: 20 },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await llmServiceWithoutCache.stuctureQuery(
          'хочу пиццу',
          [{ id: '1', name: 'Додо', coordinates: { latitude: 0, longitude: 0 }, lastUpdated: new Date() }],
        );

        expect(result).toEqual({ tags: ['пицца'] });
      });
    });

    describe('enhanceSearchResults with cache', () => {
      const mockResults: TSearchResultItem[] = [
        {
          id: '1',
          name: 'Пицца Маргарита',
          restaurant: { id: '1', name: 'Додо Пицца' },
          description: 'Классическая пицца',
          tags: ['тесто', 'сыр', 'томаты'],
          price: 500,
          orderUrl: 'https://example.com/1',
          category: EDishCategory.MAIN,
          image: 'https://example.com/1',
          available: true,
        },
        {
          id: '2',
          name: 'Пицца Пепперони',
          restaurant: { id: '1', name: 'Додо Пицца' },
          description: 'Острая пицца',
          tags: ['тесто', 'сыр', 'пепперони'],
          price: 600,
          orderUrl: 'https://example.com/2',
          category: EDishCategory.MAIN,
          image: 'https://example.com/2',
          available: true,
        },
      ];

      it('должен использовать кэшированный результат улучшения', async () => {
        const cachedEnhancedResults = [mockResults[1], mockResults[0]];

        mockCacheService.get = vi.fn().mockResolvedValue(cachedEnhancedResults);

        const result = await llmService.enhanceSearchResults(mockResults, 'острая пицца');

        expect(result).toEqual(cachedEnhancedResults);
        expect(mockCacheService.get).toHaveBeenCalledWith(expect.stringMatching(/^llm:/));
        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('должен сохранять улучшенные результаты в кэш', async () => {
        mockCacheService.get = vi.fn().mockResolvedValue(null);
        mockCacheService.set = vi.fn().mockResolvedValue(undefined);

        const mockResponse = {
          choices: [{
            message: {
              content: '2,1',
            },
          }],
          usage: { total_tokens: 50, prompt_tokens: 30, completion_tokens: 20 },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await llmService.enhanceSearchResults(mockResults, 'острая пицца');

        expect(mockCacheService.set).toHaveBeenCalledWith(
          expect.stringMatching(/^llm:/),
          expect.arrayContaining([
            expect.objectContaining({ id: '2' }),
            expect.objectContaining({ id: '1' }),
          ]),
          3600,
        );
      });

      it('должен возвращать пустой массив без обращения к кэшу', async () => {
        const result = await llmService.enhanceSearchResults([], 'тест');

        expect(result).toEqual([]);
        expect(mockCacheService.get).not.toHaveBeenCalled();
        expect(mockCacheService.set).not.toHaveBeenCalled();
      });
    });

    describe('cache error handling', () => {
      it('должен обрабатывать ошибки получения из кэша', async () => {
        mockCacheService.get = vi.fn().mockRejectedValue(new Error('Cache error'));

        const mockResponse = {
          choices: [{
            message: {
              content: '{"tags": ["пицца"]}',
            },
          }],
          usage: { total_tokens: 50, prompt_tokens: 30, completion_tokens: 20 },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await llmService.stuctureQuery(
          'хочу пиццу',
          [{ id: '1', name: 'Додо', coordinates: { latitude: 0, longitude: 0 }, lastUpdated: new Date() }],
        );

        expect(result).toEqual({ tags: ['пицца'] });
        expect(mockCacheService.get).toHaveBeenCalled();
      });

      it('должен обрабатывать ошибки сохранения в кэш', async () => {
        mockCacheService.get = vi.fn().mockResolvedValue(null);
        mockCacheService.set = vi.fn().mockRejectedValue(new Error('Cache save error'));

        const mockResponse = {
          choices: [{
            message: {
              content: '{"tags": ["пицца"]}',
            },
          }],
          usage: { total_tokens: 50, prompt_tokens: 30, completion_tokens: 20 },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await llmService.stuctureQuery(
          'хочу пиццу',
          [{ id: '1', name: 'Додо', coordinates: { latitude: 0, longitude: 0 }, lastUpdated: new Date() }],
        );

        expect(result).toEqual({ tags: ['пицца'] });
        expect(mockCacheService.set).toHaveBeenCalled();
      });
    });

    describe('cache key generation', () => {
      it('должен генерировать уникальные ключи для разных запросов', async () => {
        mockCacheService.get = vi.fn().mockResolvedValue(null);

        const mockResponse = {
          choices: [{
            message: {
              content: '{"tags": ["пицца"]}',
            },
          }],
          usage: { total_tokens: 50, prompt_tokens: 30, completion_tokens: 20 },
        };

        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await llmService.stuctureQuery(
          'хочу пиццу',
          [{ id: '1', name: 'Додо', coordinates: { latitude: 0, longitude: 0 }, lastUpdated: new Date() }],
        );
        await llmService.stuctureQuery(
          'хочу суши',
          [{ id: '1', name: 'Додо', coordinates: { latitude: 0, longitude: 0 }, lastUpdated: new Date() }],
        );

        const calls = (mockCacheService.get as Mock).mock.calls;
        expect(calls[0][0]).not.toBe(calls[1][0]);
      });

      it('должен генерировать одинаковые ключи для одинаковых запросов', async () => {
        mockCacheService.get = vi.fn().mockResolvedValue(null);

        const mockResponse = {
          choices: [{
            message: {
              content: '{"tags": ["пицца"]}',
            },
          }],
          usage: { total_tokens: 50, prompt_tokens: 30, completion_tokens: 20 },
        };

        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await llmService.stuctureQuery(
          'хочу пиццу',
          [{ id: '1', name: 'Додо', coordinates: { latitude: 0, longitude: 0 }, lastUpdated: new Date() }],
        );
        await llmService.stuctureQuery(
          'хочу пиццу',
          [{ id: '1', name: 'Додо', coordinates: { latitude: 0, longitude: 0 }, lastUpdated: new Date() }],
        );

        const calls = (mockCacheService.get as Mock).mock.calls;
        expect(calls[0][0]).toBe(calls[1][0]);
      });
    });
  });

  describe('categorizeDish', () => {
    it('должен успешно категоризировать основное блюдо', async () => {
      const mockResponse = 'основное';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: mockResponse } }],
          usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 },
        }),
      });

      const result = await llmService.categorizeDish('Пицца Маргарита', undefined, undefined, 123);

      expect(result).toBe('основное');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chat/completions'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }) as object,
          body: expect.stringContaining('Пицца Маргарита') as string,
        }),
      );
    });

    it('должен использовать кэш при повторном запросе', async () => {
      // Мокаем кэш для возврата значения
      mockCacheService.get = vi.fn().mockResolvedValue('напиток');

      const result = await llmService.categorizeDish('Кола', undefined, undefined, 123);

      expect(result).toBe('напиток');
      expect(mockFetch).not.toHaveBeenCalled(); // Не должно быть вызовов к API
    });

    it('должен обрабатывать неизвестные категории', async () => {
      const mockResponse = 'unknown_category';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: mockResponse } }],
          usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 },
        }),
      });

      const result = await llmService.categorizeDish('Странное блюдо', undefined, undefined, 123);

      expect(result).toBe('основное'); // Fallback к MAIN при неизвестной категории
    });

    it('должен использовать перманентный кэш (TTL = 0)', async () => {
      const mockResponse = 'соус';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: mockResponse } }],
          usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 },
        }),
      });

      await llmService.categorizeDish('Кетчуп', undefined, undefined, 123);

      expect(mockCacheService.set).toHaveBeenCalledWith(
        expect.any(String),
        'соус',
        0,
      );
    });
  });
});
