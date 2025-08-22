import type {
  TYEMenuItem,
  TYERestaurant,
  TYERestaurantResponsed,
} from '@/models/yandexEda';
import type { TCoordinates } from '@/models/restaurant';
import type { TMenuItem } from '@/models/menuItem';

import { logger } from '@/utils/logger';

interface TYEDataTransformer {
  transformRestaurant: (yePlace: TYERestaurantResponsed, coordinates: TCoordinates) => TYERestaurant;
  transformMenuItem: (yeMenuItem: TYEMenuItem, restaurant: TYERestaurant) => TMenuItem;
  transformRestaurants: (yePlaces: TYERestaurantResponsed[], coordinates: TCoordinates) => TYERestaurant[];
  transformMenuItems: (yeMenuItems: TYEMenuItem[], restaurant: TYERestaurant) => TMenuItem[];
}

export class YEDataTransformer implements TYEDataTransformer {
  public transformRestaurant = (yePlace: TYERestaurantResponsed, coordinates: TCoordinates): TYERestaurant => {
    try {
      const restaurant: TYERestaurant = {
        id: yePlace.slug,
        name: yePlace.name.value,
        coordinates: {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
        },
        workingHours: {
          open: '00:00',
          close: '23:59',
          isOpen: true, // По умолчанию считаем открытым
        },
        minimumOrderAmount: this.extractMinimumOrder(yePlace),
        lastUpdated: new Date(),
        additionalInfo: {
          brandSlug: yePlace.brand.slug,
        },
      };

      return restaurant;
    } catch (error) {
      logger.error('Ошибка трансформации ресторана Яндекс.Еда', error as Error, { placeSlug: yePlace.slug });
      throw new Error(`Не удалось трансформировать ресторан Яндекс.Еда: ${yePlace.slug}`);
    }
  };

  public transformMenuItem = (yeMenuItem: TYEMenuItem, restaurant: TYERestaurant): TMenuItem => {
    try {
      // Извлекаем ингредиенты из descriptions
      const ingredients = this.extractIngredients(yeMenuItem);

      // Формируем URL изображения
      const imageUrl = yeMenuItem.picture?.uri
        ? `https://eda.yandex${yeMenuItem.picture.uri.replace('{w}x{h}', '400x400')}`
        : undefined;

      const menuItem: TMenuItem = {
        id: yeMenuItem.id.toString(),
        name: yeMenuItem.name,
        description: yeMenuItem.description || '',
        ingredients,
        price: yeMenuItem.price,
        image: imageUrl,
        available: yeMenuItem.available && (yeMenuItem.inStock !== false),
        restaurant,
        orderUrl: `https://eda.yandex.ru/r/${restaurant.additionalInfo.brandSlug}?placeSlug=${restaurant.id}`,
      };

      return menuItem;
    } catch (error) {
      logger.error('Ошибка трансформации элемента меню Яндекс.Еда', error as Error, {
        menuItemId: yeMenuItem.id,
        restaurantId: restaurant.id,
      });
      throw new Error(`Не удалось трансформировать элемент меню Яндекс.Еда: ${yeMenuItem.id}`);
    }
  };

  public transformRestaurants = (yePlaces: TYERestaurantResponsed[], coordinates: TCoordinates): TYERestaurant[] =>
    yePlaces.map(place => this.transformRestaurant(place, coordinates));

  public transformMenuItems = (yeMenuItems: TYEMenuItem[], restaurant: TYERestaurant): TMenuItem[] =>
    yeMenuItems.map(item => this.transformMenuItem(item, restaurant));

  private extractIngredients = (yeMenuItem: TYEMenuItem): string[] => {
    if (!yeMenuItem.descriptions?.length) {
      return [];
    }

    // Ищем описание с составом по приоритету
    const compositionDescs = yeMenuItem.descriptions.filter(desc =>
      desc.title?.toLowerCase() === 'состав',
    );

    // Если нет точного title "Состав", ищем текст с "Состав:"
    compositionDescs.push(...yeMenuItem.descriptions.filter(desc =>
      desc.text?.toLowerCase().includes('состав:'),
    ));

    // Если нет явного указания состава, проверяем описания на схожесть со списком ингредиентов
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

  private extractMinimumOrder = (yePlace: TYERestaurantResponsed): number | undefined => {
    // Ищем информацию о минимальном заказе в chips
    const minOrderChip = yePlace.chips?.find(chip =>
      chip.payload?.text?.value?.includes('от')
      && chip.payload?.text?.value?.includes('₽'),
    );

    if (minOrderChip) {
      const text = minOrderChip.payload.text.value;
      const match = text.match(/от (\d+)\s*₽/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    return undefined;
  };
}
