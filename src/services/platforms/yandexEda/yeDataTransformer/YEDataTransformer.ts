import type { TCoordinates } from '@/types/restaurant';
import type { TMenuItem } from '@/types/menuItem';
import type {
  TYEMenuItemFromServer,
  TYERestaurant,
  TYERestaurantFromServer,
} from '@/services/platforms/yandexEda/yeApiService/types';
import type { LLMService } from '@/services/LLMService/LLMService';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { EDishCategory } from '@/types/menuItem';
import { botConfig } from '@/config/bot';

import type { TYEDataTransformer } from './types';

export class YEDataTransformer implements TYEDataTransformer {
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
      throw new Error(`Не удалось трансформировать ресторан Яндекс.Еда: ${yeRestaurant.slug}`);
    }
  };

  public transformMenuItem = async (
    yeMenuItem: TYEMenuItemFromServer,
    restaurant: TYERestaurant,
  ): Promise<TMenuItem> => {
    try {
      const ingredients = this.extractIngredients(yeMenuItem);

      const imageUrl = yeMenuItem.picture?.uri
        ? `https://eda.yandex${yeMenuItem.picture.uri.replace('{w}x{h}', '400x400')}`
        : undefined;

      // Определяем категорию блюда через LLM
      let category: EDishCategory;
      try {
        category = await this.llmService.categorizeDish(yeMenuItem.name);
      } catch (error) {
        ConsoleLogger.error('Ошибка категоризации блюда, используем MAIN', error as Error, { dishName: yeMenuItem.name });
        category = EDishCategory.MAIN; // Fallback к основной категории
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
        orderUrl: `https://eda.yandex.ru/r/${restaurant.additionalInfo.brandSlug}?placeSlug=${restaurant.id}`,
        category,
      };

      return menuItem;
    } catch (error) {
      ConsoleLogger.error('Ошибка трансформации элемента меню Яндекс.Еда', error as Error, {
        menuItemId: yeMenuItem.id,
        restaurantId: restaurant.id,
      });
      throw new Error(`Не удалось трансформировать элемент меню Яндекс.Еда: ${yeMenuItem.id}`);
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

      for (const yeMenuItem of yeMenuItems) {
        try {
          const menuItem = await this.transformMenuItem(yeMenuItem, restaurant);
          menuItems.push(menuItem);
        } catch (error) {
          ConsoleLogger.error('Не удалось трансформировать элемент меню', error as Error, {
            menuItemId: yeMenuItem.id,
            restaurantId: restaurant.id,
          });
        }
      }

      return menuItems;
    } catch (error) {
      ConsoleLogger.error('Ошибка трансформации меню Яндекс.Еда', error as Error, {
        restaurantId: restaurant.id,
        itemsCount: yeMenuItems.length,
      });
      throw new Error(`Не удалось трансформировать меню Яндекс.Еда для ресторана: ${restaurant.id}`);
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
      if (!desc.text) return false;

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

    const ingredients: string[] = [];

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
            ingredients.push(lowercased);
          }
        });
    }

    return ingredients;
  };
}
