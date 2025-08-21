import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { TSearchResult, TStructuredQuery } from '@/models/search';

import { LLMService } from './LLMService';

// Мокируем fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Мокируем конфигурацию
vi.mock('@/config/bot', () => ({
  botConfig: {
    llmApiUrl: 'https://api.openrouter.ai/v1/chat/completions',
    llmApiKey: 'test-api-key',
  },
}));

describe('LLMService', () => {
  let llmService: LLMService;

  beforeEach(() => {
    llmService = new LLMService();
  });

  describe('transformQuery', () => {
    it('должен успешно трансформировать запрос в структурированный JSON', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '{"ingredients": ["пицца", "сыр"], "priceRange": {"min": 200, "max": 800}}',
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

      const result = await llmService.transformQuery('хочу пиццу с сыром до 800 рублей');

      expect(result).toEqual({
        ingredients: ['пицца', 'сыр'],
        priceRange: { min: 200, max: 800 },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openrouter.ai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('хочу пиццу с сыром до 800 рублей') as object,
        }),
      );
    });

    it('должен обрабатывать запросы с ресторанами и исключениями', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: `{
              "restaurants": ["Додо Пицца", "Папа Джонс"],
              "ingredients": ["пепперони"],
              "exclusions": {
                "ingredients": ["ананас"],
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

      const result = await llmService.transformQuery('пепперони из Додо или Папа Джонс, но без ананаса и не дороже 300');

      expect(result).toEqual({
        restaurants: ['додо пицца', 'папа джонс'],
        ingredients: ['пепперони'],
        exclusions: {
          ingredients: ['ананас'],
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

      const result = await llmService.transformQuery('тест');

      expect(result).toEqual({});
    });

    it('должен повторять попытки при ошибках сети', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            choices: [{ message: { content: '{"ingredients": ["тест"]}' } }],
            usage: { total_tokens: 50, prompt_tokens: 30, completion_tokens: 20 },
          }),
        });

      const fetching = llmService.transformQuery('тест');
      await vi.advanceTimersToNextTimerAsync();
      await vi.advanceTimersToNextTimerAsync();
      const result = await fetching;

      expect(result).toEqual({ ingredients: ['тест'] });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('должен выбрасывать ошибку при превышении лимита попыток', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const expection = expect(llmService.transformQuery('тест')).rejects.toThrow('Не удалось трансформировать запрос');
      await vi.advanceTimersToNextTimerAsync();
      await vi.advanceTimersToNextTimerAsync();
      await expection;
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('должен обрабатывать таймауты', async () => {
      const llmService = new LLMService({
        maxRetries: 0,
        timeout: 10000,
      });

      // Мокаем fetch чтобы он никогда не резолвился
      mockFetch.mockImplementation((url: string, options: { signal: AbortSignal }) => new Promise(resolve => {
        options.signal.onabort = resolve;
      }));

      const expection = expect(llmService.transformQuery('тест')).rejects.toThrow('Не удалось трансформировать запрос');
      vi.advanceTimersByTime(10000);
      await expection;
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('enhanceSearchResults', () => {
    const mockResults: TSearchResult[] = [
      {
        id: '1',
        name: 'Пицца Маргарита',
        restaurant: { id: '1', name: 'Додо Пицца' },
        description: 'Классическая пицца',
        ingredients: ['тесто', 'сыр', 'томаты'],
        price: 500,
        orderUrl: 'https://example.com/1',
      },
      {
        id: '2',
        name: 'Пицца Пепперони',
        restaurant: { id: '1', name: 'Додо Пицца' },
        description: 'Острая пицца',
        ingredients: ['тесто', 'сыр', 'пепперони'],
        price: 600,
        orderUrl: 'https://example.com/2',
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
      const llmService = new LLMService({
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

      expect(result).toEqual(mockResults);
    });
  });

  describe('parseStructuredQuery', () => {
    type MockLLMService = { parseStructuredQuery: (response: string) => TStructuredQuery };

    it('должен извлекать JSON из ответа с дополнительным текстом', () => {
      const response = 'Вот структурированный запрос: {"ingredients": ["пицца"]} Спасибо!';

      const result = (llmService as unknown as MockLLMService).parseStructuredQuery(response);

      expect(result).toEqual({ ingredients: ['пицца'] });
    });

    it('должен извлекать JSON из ответа с дополнительным текстом и новой строкой', () => {
      const response = `Вот структурированный запрос: 
      {
        "ingredients": ["пицца"]
      }
      Спасибо!`;

      const result = (llmService as unknown as MockLLMService).parseStructuredQuery(response);

      expect(result).toEqual({ ingredients: ['пицца'] });
    });

    it('должен выбрасывать ошибку при отсутствии JSON', () => {
      const response = 'Просто текст без JSON';

      expect(() => (llmService as unknown as MockLLMService).parseStructuredQuery(response)).toThrow('JSON не найден в ответе');
    });

    it('должен фильтровать неверные типы данных', () => {
      const response = '{"restaurants": ["Додо", 123, null], "ingredients": ["пицца", 456]}';

      const result = (llmService as unknown as MockLLMService).parseStructuredQuery(response);

      expect(result).toEqual({
        restaurants: ['додо'],
        ingredients: ['пицца'],
      });
    });
  });

  describe('parseEnhancedResults', () => {
    type MockLLMService = { parseEnhancedResults: (response: string, results: TSearchResult[]) => TSearchResult[] };

    const mockResults: TSearchResult[] = [
      { id: '1', name: 'Блюдо 1', restaurant: { id: '1', name: 'Ресторан 1' }, description: '', ingredients: [], price: 100, orderUrl: '' },
      { id: '2', name: 'Блюдо 2', restaurant: { id: '1', name: 'Ресторан 1' }, description: '', ingredients: [], price: 200, orderUrl: '' },
      { id: '3', name: 'Блюдо 3', restaurant: { id: '1', name: 'Ресторан 1' }, description: '', ingredients: [], price: 300, orderUrl: '' },
    ];

    it('должен переупорядочивать результаты по номерам', () => {
      const response = '3,1,2';

      const result = (llmService as unknown as MockLLMService).parseEnhancedResults(response, mockResults);

      expect(result).toEqual([mockResults[2], mockResults[0], mockResults[1]]);
    });

    it('должен добавлять оставшиеся результаты в конец', () => {
      const response = '2';

      const result = (llmService as unknown as MockLLMService).parseEnhancedResults(response, mockResults);

      expect(result).toEqual([mockResults[1], mockResults[0], mockResults[2]]);
    });

    it('должен возвращать оригинальные результаты при пустом ответе', () => {
      const response = '';

      const result = (llmService as unknown as MockLLMService).parseEnhancedResults(response, mockResults);

      expect(result).toEqual(mockResults);
    });

    it('должен игнорировать некорректные номера', () => {
      const response = '2,999,1';

      const result = (llmService as unknown as MockLLMService).parseEnhancedResults(response, mockResults);

      expect(result).toEqual([mockResults[1], mockResults[0], mockResults[2]]);
    });
  });

  describe('repairQueryStructure', () => {
    type MockLLMService = { repairQueryStructure: (query: TStructuredQuery) => TStructuredQuery };

    it('должен нормализовать и удалять дубликаты в ресторанах', () => {
      const query: TStructuredQuery = {
        restaurants: ['Додо Пицца', 'додо пицца', 'ДОДО ПИЦЦА', 'Папа Джонс'],
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(query);

      expect(result).toEqual({
        restaurants: ['додо пицца', 'папа джонс'],
      });
    });

    it('должен нормализовать и удалять дубликаты в ингредиентах', () => {
      const query: TStructuredQuery = {
        ingredients: ['Пицца', 'пицца', 'Сыр', 'сыр', 'Томаты'],
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(query);

      expect(result).toEqual({
        ingredients: ['пицца', 'сыр', 'томаты'],
      });
    });

    it('должен исправлять некорректные типы данных в ресторанах', () => {
      const query = {
        restaurants: ['Додо', 123, null, 'Папа Джонс', undefined, ''],
      } as TStructuredQuery;

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(query);

      expect(result).toEqual({
        restaurants: ['додо', 'папа джонс'],
      });
    });

    it('должен исправлять некорректные типы данных в ингредиентах', () => {
      const query = {
        ingredients: ['Пицца', 456, null, 'Сыр', undefined, ''],
      } as TStructuredQuery;

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(query);

      expect(result).toEqual({
        ingredients: ['пицца', 'сыр'],
      });
    });

    it('должен исправлять отрицательные цены в ценовом диапазоне', () => {
      const query: TStructuredQuery = {
        priceRange: { min: -100, max: 500 },
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(query);

      expect(result).toEqual({
        priceRange: { min: 0, max: 500 },
      });
    });

    it('должен исправлять отрицательные максимальные цены', () => {
      const query: TStructuredQuery = {
        priceRange: { min: 100, max: -50 },
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(query);

      expect(result).toEqual({
        priceRange: { min: 100, max: Number.MAX_SAFE_INTEGER },
      });
    });

    it('должен исправлять диапазон где min > max', () => {
      const query: TStructuredQuery = {
        priceRange: { min: 500, max: 100 },
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(query);

      expect(result).toEqual({
        priceRange: { min: 0, max: 100 },
      });
    });

    it('должен обрабатывать исключения с ресторанами', () => {
      const query: TStructuredQuery = {
        ingredients: ['пицца'],
        exclusions: {
          restaurants: ['Додо Пицца', 'додо пицца', 'Папа Джонс'],
        },
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(query);

      expect(result).toEqual({
        ingredients: ['пицца'],
        exclusions: {
          restaurants: ['додо пицца', 'папа джонс'],
        },
      });
    });

    it('должен обрабатывать исключения с ингредиентами', () => {
      const query: TStructuredQuery = {
        ingredients: ['пицца'],
        exclusions: {
          ingredients: ['Ананас', 'ананас', 'Оливки'],
        },
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(query);

      expect(result).toEqual({
        ingredients: ['пицца'],
        exclusions: {
          ingredients: ['ананас', 'оливки'],
        },
      });
    });

    it('должен исправлять ценовые диапазоны в исключениях', () => {
      const query: TStructuredQuery = {
        ingredients: ['пицца'],
        exclusions: {
          priceRange: { min: -50, max: 300 },
        },
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(query);

      expect(result).toEqual({
        ingredients: ['пицца'],
        exclusions: {
          priceRange: { min: 0, max: 300 },
        },
      });
    });

    it('должен исправлять некорректные ценовые диапазоны в исключениях', () => {
      const query: TStructuredQuery = {
        ingredients: ['пицца'],
        exclusions: {
          priceRange: { min: 500, max: 100 },
        },
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(query);

      expect(result).toEqual({
        ingredients: ['пицца'],
        exclusions: {
          priceRange: { min: 0, max: 100 },
        },
      });
    });

    it('должен обрабатывать пустые массивы', () => {
      const query: TStructuredQuery = {
        restaurants: [],
        ingredients: [],
      };

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(query);

      expect(result).toEqual({
        restaurants: [],
        ingredients: [],
      });
    });

    it('должен обрабатывать пустую структуру', () => {
      const query: TStructuredQuery = {};

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(query);

      expect(result).toEqual({});
    });

    it('должен обрабатывать сложную структуру с множественными исправлениями', () => {
      const query = {
        restaurants: ['Додо', 123, 'додо', 'Папа Джонс'],
        ingredients: ['Пицца', null, 'пицца', 'Сыр'],
        priceRange: { min: -100, max: -50 },
        exclusions: {
          restaurants: ['Додо', undefined, 'додо'],
          ingredients: ['Ананас', 456, 'ананас'],
          priceRange: { min: 500, max: 100 },
        },
      } as TStructuredQuery;

      const result = (llmService as unknown as MockLLMService).repairQueryStructure(query);

      expect(result).toEqual({
        restaurants: ['додо', 'папа джонс'],
        ingredients: ['пицца', 'сыр'],
        priceRange: { min: 0, max: Number.MAX_SAFE_INTEGER },
        exclusions: {
          restaurants: ['додо'],
          ingredients: ['ананас'],
          priceRange: { min: 0, max: 100 },
        },
      });
    });
  });
});
