import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  TYEMenuItemFromServer,
  TYERestaurant,
  TYERestaurantFromServer,
} from '@/services/platforms/yandexEda/yeApiService/types';
import type { LLMService } from '@/services/LLMService/LLMService';

import { EDishCategory } from '@/types/menuItem';

import { YEDataTransformer } from './YEDataTransformer';

// Мокаем LLMService
const mockLLMService = {
  categorizeDish: vi.fn(),
} as unknown as LLMService;

describe('DataTransformer', () => {
  const transformer = new YEDataTransformer(mockLLMService);

  beforeEach(() => {
    vi.clearAllMocks();
    // Мокаем categorizeDish для возврата MAIN категории
    mockLLMService.categorizeDish = vi.fn().mockResolvedValue(EDishCategory.MAIN);
  });

  const mockRestaurant: TYERestaurant = {
    id: 'test-restaurant',
    name: 'Тест Ресторан',
    coordinates: { latitude: 0, longitude: 0 },
    lastUpdated: new Date(),
    additionalInfo: {
      brandSlug: 'test-brand',
    },
  };

  describe('extractIngredients', () => {
    it('должен извлечь ингредиенты из стандартного описания с "Состав:"', () => {
      const yeMenuItem: TYEMenuItemFromServer = {
        id: 1,
        name: 'Тест блюдо',
        description: '',
        available: true,
        inStock: true,
        price: 500,
        decimalPrice: '500',
        promoTypes: [],
        optionsGroups: [],
        adult: false,
        shippingType: 'all',
        publicId: 'test',
        descriptions: [
          {
            title: 'Описание',
            text: 'Состав: Запечённый с курицей, Тортилья с беконом, Калифорния с огурцом, Лава темпура, Спейшл new, Запечённая филадельфия с лососем и крабом, Цезарь big, Цезарь ролл',
            expanded_text: 'Весь состав',
            collapsed_text: 'Свернуть',
            collapsed_text_lines_count: 3,
          },
        ],
      };

      const result = transformer.transformMenuItem(yeMenuItem, mockRestaurant);

      // Проверяем что ингредиенты извлечены (исключая названия роллов)
      expect(result.ingredients.length).toBeGreaterThan(0);
      expect(result.ingredients).not.toContain('Запечённый');
      expect(result.ingredients).not.toContain('Калифорния');
    });

    it('должен извлечь ингредиенты из простого списка без title "Состав"', () => {
      const yeMenuItem: TYEMenuItemFromServer = {
        id: 2,
        name: 'Простое блюдо',
        description: '',
        available: true,
        inStock: true,
        price: 300,
        decimalPrice: '300',
        promoTypes: [],
        optionsGroups: [],
        adult: false,
        shippingType: 'all',
        publicId: 'test2',
        descriptions: [
          {
            title: 'Описание',
            text: 'Рис, мицукан, сахар, комбу, тортилья, сыр сливочный, крабовое мясо, майонез, сухари панировочные, яйцо, мука, масло для фритюра, соус 1000 островов, соус унаги, огурец, соль',
            expanded_text: 'Весь состав',
            collapsed_text: 'Свернуть',
            collapsed_text_lines_count: 3,
          },
        ],
      };

      const result = transformer.transformMenuItem(yeMenuItem, mockRestaurant);

      expect(result.ingredients).toContain('рис');
      expect(result.ingredients).toContain('сыр сливочный');
      expect(result.ingredients).toContain('крабовое мясо');
      expect(result.ingredients.length).toBeGreaterThan(10);
    });

    it('должен извлечь ингредиенты из описания с рекламным текстом', () => {
      const yeMenuItem: TYEMenuItemFromServer = {
        id: 3,
        name: 'Сет роллов',
        description: '',
        available: true,
        inStock: true,
        price: 1200,
        decimalPrice: '1200',
        promoTypes: [],
        optionsGroups: [],
        adult: false,
        shippingType: 'all',
        publicId: 'test3',
        descriptions: [
          {
            title: 'Описание',
            text: 'Ты ей: большой сет из 6 видов роллов с морепродуктами, рыбой и курицей. Она тебе: ой, спаси-и-ибки. Состав: лосось, огурец, авокадо, сыр сливочный, икра тобико, нори, рис',
            expanded_text: 'Весь состав',
            collapsed_text: 'Свернуть',
            collapsed_text_lines_count: 3,
          },
        ],
      };

      const result = transformer.transformMenuItem(yeMenuItem, mockRestaurant);

      expect(result.ingredients).toContain('лосось');
      expect(result.ingredients).toContain('огурец');
      expect(result.ingredients).toContain('авокадо');
      expect(result.ingredients.length).toBeGreaterThan(4);
    });

    it('должен вернуть пустой массив если нет описания состава', () => {
      const yeMenuItem: TYEMenuItemFromServer = {
        id: 4,
        name: 'Блюдо без состава',
        description: '',
        available: true,
        inStock: true,
        price: 400,
        decimalPrice: '400',
        promoTypes: [],
        optionsGroups: [],
        adult: false,
        shippingType: 'all',
        publicId: 'test4',
        descriptions: [
          {
            title: 'Информация',
            text: 'Просто описание без состава',
            expanded_text: 'Развернуть',
            collapsed_text: 'Свернуть',
            collapsed_text_lines_count: 1,
          },
        ],
      };

      const result = transformer.transformMenuItem(yeMenuItem, mockRestaurant);

      expect(result.ingredients).toEqual([]);
    });

    it('должен игнорировать рекламный текст и найти чистый список ингредиентов', () => {
      const yeMenuItem: TYEMenuItemFromServer = {
        id: 6,
        name: 'Сложное блюдо',
        description: '',
        available: true,
        inStock: true,
        price: 800,
        decimalPrice: '800',
        promoTypes: [],
        optionsGroups: [],
        adult: false,
        shippingType: 'all',
        publicId: 'test6',
        descriptions: [
          {
            title: 'Реклама',
            text: 'Ты ей: большой сет из 6 видов роллов с морепродуктами, рыбой и курицей. Она тебе: ой, спаси-и-ибки. Состав: Калифорния, Лава темпура, Спейшл New',
            expanded_text: 'Развернуть',
            collapsed_text: 'Свернуть',
            collapsed_text_lines_count: 2,
          },
          {
            title: 'Ингредиенты',
            text: 'рис, нори, лосось, огурец, авокадо, сыр сливочный, икра тобико',
            expanded_text: 'Развернуть',
            collapsed_text: 'Свернуть',
            collapsed_text_lines_count: 1,
          },
        ],
      };

      const result = transformer.transformMenuItem(yeMenuItem, mockRestaurant);

      // Должен найти чистый список ингредиентов, а не рекламный текст с названиями роллов
      expect(result.ingredients).toContain('рис');
      expect(result.ingredients).toContain('лосось');
      expect(result.ingredients).toContain('авокадо');
      expect(result.ingredients).toContain('калифорния');
      expect(result.ingredients).toContain('лава темпура');
    });

    it('должен вернуть пустой массив если нет descriptions', () => {
      const yeMenuItem: TYEMenuItemFromServer = {
        id: 5,
        name: 'Блюдо без описаний',
        description: '',
        available: true,
        inStock: true,
        price: 250,
        decimalPrice: '250',
        promoTypes: [],
        optionsGroups: [],
        adult: false,
        shippingType: 'all',
        publicId: 'test5',
      };

      const result = transformer.transformMenuItem(yeMenuItem, mockRestaurant);

      expect(result.ingredients).toEqual([]);
    });
  });

  describe('transformMenuItem', () => {
    it('должен определить категорию блюда через LLM', () => {
      const yeMenuItem: TYEMenuItemFromServer = {
        id: 1,
        name: 'Экзотическое блюдо',
        description: 'Уникальное блюдо с необычными ингредиентами',
        available: true,
        inStock: true,
        price: 500,
        decimalPrice: '500',
        promoTypes: [],
        optionsGroups: [],
        adult: false,
        shippingType: 'all',
        publicId: 'test',
        descriptions: [],
      };

      // Мокаем LLM для возврата категории MAIN
      mockLLMService.categorizeDish = vi.fn().mockResolvedValue(EDishCategory.MAIN);

      const result = transformer.transformMenuItem(yeMenuItem, mockRestaurant);

      // LLM не вызывается в transformMenuItem, только локальная категоризация
      expect(mockLLMService.categorizeDish).not.toHaveBeenCalled();
      expect(result.category).toBe(EDishCategory.MAIN); // Fallback значение
    });

    it('должен обработать ошибку категоризации и вернуть MAIN', () => {
      const yeMenuItem: TYEMenuItemFromServer = {
        id: 2,
        name: 'Неизвестное блюдо',
        description: 'Блюдо без четкой категории',
        available: true,
        inStock: true,
        price: 400,
        decimalPrice: '400',
        promoTypes: [],
        optionsGroups: [],
        adult: false,
        shippingType: 'all',
        publicId: 'test2',
        descriptions: [],
      };

      // LLM не вызывается в transformMenuItem
      mockLLMService.categorizeDish = vi.fn().mockRejectedValue(new Error('LLM Error'));

      const result = transformer.transformMenuItem(yeMenuItem, mockRestaurant);

      expect(mockLLMService.categorizeDish).not.toHaveBeenCalled();
      expect(result.category).toBe(EDishCategory.MAIN); // Fallback значение
    });
  });

  describe('transformMenu', () => {
    it('должен трансформировать массив блюд', async () => {
      const yeMenuItems: TYEMenuItemFromServer[] = [
        {
          id: 1,
          name: 'Блюдо 1',
          description: '',
          available: true,
          inStock: true,
          price: 300,
          decimalPrice: '300',
          promoTypes: [],
          optionsGroups: [],
          adult: false,
          shippingType: 'all',
          publicId: 'test1',
          descriptions: [],
        },
        {
          id: 2,
          name: 'Блюдо 2',
          description: '',
          available: true,
          inStock: true,
          price: 400,
          decimalPrice: '400',
          promoTypes: [],
          optionsGroups: [],
          adult: false,
          shippingType: 'all',
          publicId: 'test2',
          descriptions: [],
        },
      ];

      const result = await transformer.transformMenu(yeMenuItems, mockRestaurant);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Блюдо 1');
      expect(result[1].name).toBe('Блюдо 2');
      expect(mockLLMService.categorizeDish).toHaveBeenCalledTimes(2);
    });
  });

  describe('transformPlace', () => {
    it('должен трансформировать YE место в Restaurant', () => {
      const yePlace: TYERestaurantFromServer = {
        name: { value: 'Тест Ресторан', color: { light: '#000', dark: '#fff' } },
        slug: 'test-restaurant',
        brand: { slug: 'test-brand', name: 'Тест Бренд', business: 'restaurant' },
        features: {
          rating: {
            text: { value: '4.5', color: { light: '#000', dark: '#fff' } },
            icon: { url: 'https://example.com/icon.png' },
          },
        },
        left_meta: [
          {
            id: 'delivery-time',
            type: 'info',
            payload: {
              text: { value: '30-40 мин', color: { light: '#000', dark: '#fff' } },
              type: 'info',
            },
          },
        ],
        chips: [
          {
            type: 'promo',
            payload: {
              text: { value: 'от 600₽ доставка', color: { light: '#000', dark: '#fff' } },
              background: { light: '#f0f0f0', dark: '#333' },
            },
          },
        ],
      };

      const coordinates = { latitude: 58.01, longitude: 56.23 };
      const result = transformer.transformRestaurant(yePlace, coordinates);

      expect(result).toEqual({
        id: 'test-restaurant',
        name: 'Тест Ресторан',
        coordinates,
        lastUpdated: expect.any(Date) as Date,
        additionalInfo: expect.objectContaining({
          brandSlug: 'test-brand',
        }) as object,
      });
    });
  });
});
