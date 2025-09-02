import type { TCoordinates } from '@/types/restaurant';
import type { TMenuItem } from '@/types/menuItem';
import type {
  TYEMenuItemFromServer,
  TYERestaurant,
  TYERestaurantFromServer,
} from '@/services/platforms/yandexEda/yeApiService/types';
import type { LLMService } from '@/services/LLMService/LLMService';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { AppError } from '@/utils/AppError';
import { EDishCategory } from '@/types/menuItem';
import { botConfig } from '@/config/bot';

export class YEDataTransformer {
  // Локальный классификатор для быстрой категоризации
  private readonly localClassifier = {
    accessory: ['салфетки', 'палочки', 'вилка', 'ложка', 'контейнер', 'упаковка'],
    drink: ['кола', 'сок', 'чай', 'кофе', 'лимонад', 'вода', 'напиток', 'компот', 'морс'],
    main: ['бургер', 'пицца', 'ролл', 'суши', 'стейк', 'курица', 'паста', 'суп', 'шашлык', 'котлета', 'рыба', 'мясо'],
    sauce: ['кетчуп', 'майонез', 'горчица', 'соус', 'заправка', 'аджика', 'хрен'],
    side: ['картошка', 'рис', 'макароны', 'салат', 'овощи', 'гарнир', 'пюре'],
    dessert: ['печенье', 'торт', 'мороженое', 'десерт'],
    snack: ['салат', 'закуска'],
  };

  constructor(
    private readonly llmService: LLMService,
  ) { }

  public transformRestaurant = (yeRestaurant: TYERestaurantFromServer, coordinates: TCoordinates): TYERestaurant => {
    try {
      const restaurant: TYERestaurant = {
        id: yeRestaurant.slug,
        name: yeRestaurant.name.value,
        coordinates: {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        },
        lastUpdated: new Date(),
        additionalInfo: {
          brandSlug: yeRestaurant.brand.slug,
        },
      };

      return restaurant;
    } catch (error) {
      ConsoleLogger.error('Ошибка трансформации ресторана Яндекс.Еда', error as Error, { restaurantId: yeRestaurant.slug });
      throw AppError.systemError(`Не удалось трансформировать ресторан Яндекс.Еда: ${yeRestaurant.slug}`, error as Error);
    }
  };

  // Локальная категоризация без LLM
  private categorizeLocally = (name: string, description?: string): EDishCategory | null => {
    const text = `${name} ${description || ''}`.toLowerCase();

    for (const [category, keywords] of Object.entries(this.localClassifier)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        switch (category) {
          case 'accessory': return EDishCategory.ACCESSORY;
          case 'dessert': return EDishCategory.DESSERT;
          case 'drink': return EDishCategory.DRINK;
          case 'main': return EDishCategory.MAIN;
          case 'sauce': return EDishCategory.SAUCE;
          case 'side': return EDishCategory.SIDE;
        }
      }
    }

    return null; // Не удалось определить локально
  };

  public transformMenuItem = (
    yeMenuItem: TYEMenuItemFromServer,
    restaurant: TYERestaurant,
  ): TMenuItem => {
    try {
      const ingredients = this.extractIngredients(yeMenuItem);

      const imageUrl = yeMenuItem.picture?.uri
        ? `https://eda.yandex${yeMenuItem.picture.uri.replace('{w}x{h}', '400x400')}`
        : undefined;

      // Сначала пробуем локальную категоризацию
      let category = this.categorizeLocally(yeMenuItem.name, yeMenuItem.description);

      // Если не удалось, используем LLM (будет обработано в батче)
      if (!category) {
        category = EDishCategory.MAIN; // Временное значение, будет заменено в батче
      }

      const menuItem: TMenuItem = {
        id: `ye_${yeMenuItem.id}`,
        name: yeMenuItem.name,
        description: yeMenuItem.description || '',
        ingredients,
        price: yeMenuItem.price,
        image: imageUrl || botConfig.fallbackFoodImage,
        available: yeMenuItem.available && (yeMenuItem.inStock !== false),
        restaurant,
        orderUrl: `https://eda.yandex.ru/r/${restaurant.additionalInfo.brandSlug}?placeSlug=${restaurant.id}&search=${yeMenuItem.name}`,
        category,
      };

      return menuItem;
    } catch (error) {
      ConsoleLogger.error('Ошибка трансформации элемента меню Яндекс.Еда', error as Error, {
        menuItemId: yeMenuItem.id,
        restaurantId: restaurant.id,
      });
      throw AppError.systemError(`Не удалось трансформировать элемент меню Яндекс.Еда: ${yeMenuItem.id}`, error as Error);
    }
  };

  public transformRestaurants = (yeRestaurant: TYERestaurantFromServer[], coordinates: TCoordinates): TYERestaurant[] =>
    yeRestaurant.map(place => this.transformRestaurant(place, coordinates));

  public transformMenu = async (
    yeMenuItems: TYEMenuItemFromServer[],
    restaurant: TYERestaurant,
  ): Promise<TMenuItem[]> => {
    try {
      const menuItems: TMenuItem[] = [];
      const itemsForLLM: {
        item: TMenuItem;
        index: number;
      }[] = [];

      // Первый проход - создаем базовые элементы и собираем те, что нуждаются в LLM
      for (let i = 0; i < yeMenuItems.length; i++) {
        const yeMenuItem = yeMenuItems[i];
        try {
          const ingredients = this.extractIngredients(yeMenuItem);
          const imageUrl = yeMenuItem.picture?.uri
            ? `https://eda.yandex${yeMenuItem.picture.uri.replace('{w}x{h}', '400x400')}`
            : undefined;

          // Проверяем локальную категоризацию
          const localCategory = this.categorizeLocally(yeMenuItem.name, yeMenuItem.description);

          const menuItem: TMenuItem = {
            id: `ye_${yeMenuItem.publicId}`,
            name: yeMenuItem.name,
            description: yeMenuItem.description || '',
            ingredients,
            price: yeMenuItem.price,
            image: imageUrl || botConfig.fallbackFoodImage,
            available: yeMenuItem.available && (yeMenuItem.inStock !== false),
            restaurant,
            orderUrl: `https://eda.yandex.ru/r/${restaurant.additionalInfo.brandSlug}?category=&item=${yeMenuItem.publicId}&placeSlug=${restaurant.id}`,
            category: localCategory || EDishCategory.MAIN, // Временное значение
          };

          menuItems.push(menuItem);

          // Если локальная категоризация не сработала, добавляем в список для LLM
          if (!localCategory) {
            itemsForLLM.push({
              item: menuItem,
              index: i,
            });
          }
        } catch (error) {
          ConsoleLogger.error('Не удалось трансформировать элемент меню', error as Error, {
            menuItemId: yeMenuItem.id,
            restaurantId: restaurant.id,
          });
        }
      }

      // Батч категоризация через LLM для сложных случаев
      if (itemsForLLM.length > 0) {
        try {
          const categories = await this.llmService.categorizeBatch(itemsForLLM.map(item => item.item));

          // Обновляем категории в элементах меню
          for (let i = 0; i < itemsForLLM.length; i++) {
            const item = itemsForLLM[i];
            menuItems[item.index].category = categories[i];
          }
        } catch (error) {
          ConsoleLogger.error('Ошибка батч категоризации, оставляем MAIN', error as Error);
        }
      }

      return menuItems;
    } catch (error) {
      ConsoleLogger.error('Ошибка трансформации меню Яндекс.Еда', error as Error, {
        restaurantId: restaurant.id,
        itemsCount: yeMenuItems.length,
      });
      throw AppError.systemError(`Не удалось трансформировать меню Яндекс.Еда для ресторана: ${restaurant.id}`, error as Error);
    }
  };

  private extractIngredients = (yeMenuItem: TYEMenuItemFromServer): string[] => {
    if (!yeMenuItem.descriptions?.length) {
      return [];
    }

    // Ищем описание с составом по приоритету
    const compositionDescs = yeMenuItem.descriptions.filter(desc =>
      desc.title?.toLowerCase() === 'состав',
    );

    compositionDescs.push(...yeMenuItem.descriptions.filter(desc =>
      desc.text?.toLowerCase().includes('состав:'),
    ));

    // Проверяем описания на схожесть со списком ингредиентов
    compositionDescs.push(...yeMenuItem.descriptions.filter(desc => {
      if (!desc.text || compositionDescs.includes(desc)) return false;

      // Проверяем что текст похож на список ингредиентов:
      // - содержит запятые
      // - слова короткие (ингредиенты обычно 1-3 слова)
      const text = desc.text.toLowerCase();
      const hasCommas = text.includes(',');
      const wordsCount = text.split(/\s+/).length;
      const commasCount = (text.match(/,/g) || []).length;

      // Если много запятых относительно слов - похоже на список ингредиентов
      const isLikelyIngredientsList = hasCommas && commasCount > wordsCount / 8;

      return isLikelyIngredientsList && text.length < 500;
    }));

    if (!compositionDescs.length) {
      return [];
    }

    const ingredients = new Set<string>();

    for (const compositionDesc of compositionDescs) {
      let ingredientsText = compositionDesc.text;

      // Если есть "Состав:" в тексте, берем только часть после него
      const compositionMatch = ingredientsText.match(/состав:\s*(.+)/i);
      if (compositionMatch) {
        ingredientsText = compositionMatch[1];
      }

      // Разбиваем по запятым и очищаем
      ingredientsText
        .split(',')
        .map(ingredient => ingredient.trim())
        .filter(ingredient => ingredient.length > 0 && ingredient.length < 100)
        .map(ingredient => {
        // Убираем лишние символы и приводим к нормальному виду
          return ingredient
            .replace(/^[«"'"]/g, '') // Убираем кавычки в начале
            .replace(/[«"'"]$/g, '') // Убираем кавычки в конце
            .replace(/\s+/g, ' ') // Нормализуем пробелы
            .trim();
        })
        .forEach(ingredient => {
        // Исключаем явно не ингредиенты (названия роллов, описания и т.д.)
          const lowercased = ingredient.toLowerCase();
          const excludePatterns = [
            'большой', 'маленький', 'спаси-и-ибки', 'ой', 'тебе', 'она', 'ты ей', 'видов',
          ];

          if (!excludePatterns.some(pattern => lowercased.includes(pattern))
               && ingredient.length > 1) {
            ingredients.add(lowercased);
          }
        });
    }

    return Array.from(ingredients);
  };
}
