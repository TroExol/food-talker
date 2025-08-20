import type { TYEMenuItem, TYEPlace } from '@/models/yandexEda';
import type { TCoordinates, TRestaurant } from '@/models/restaurant';
import type { TMenuItem } from '@/models/menuItem';

import { logger } from '@/utils/logger';

export interface TYEDataTransformer {
  transformPlace: (yePlace: TYEPlace, coordinates: TCoordinates) => TRestaurant;
  transformMenuItem: (yeMenuItem: TYEMenuItem, restaurant: TRestaurant) => TMenuItem;
  transformPlaces: (yePlaces: TYEPlace[], coordinates: TCoordinates) => TRestaurant[];
  transformMenuItems: (yeMenuItems: TYEMenuItem[], restaurant: TRestaurant) => TMenuItem[];
}

export class YEDataTransformer implements TYEDataTransformer {
  public transformPlace = (yePlace: TYEPlace, coordinates: TCoordinates): TRestaurant => {
    try {
      const restaurant: TRestaurant = {
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
        isActive: true,
        lastUpdated: new Date(),
        additionalInfo: {
          brandSlug: yePlace.brand.slug,
        },
      };

      return restaurant;
    } catch (error) {
      logger.error('Ошибка трансформации места', error as Error, { placeSlug: yePlace.slug });
      throw new Error(`Не удалось трансформировать место: ${yePlace.slug}`);
    }
  };

  public transformMenuItem = (yeMenuItem: TYEMenuItem, restaurant: TRestaurant): TMenuItem => {
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
      };

      return menuItem;
    } catch (error) {
      logger.error('Ошибка трансформации элемента меню', error as Error, {
        menuItemId: yeMenuItem.id,
        restaurantId: restaurant.id,
      });
      throw new Error(`Не удалось трансформировать элемент меню: ${yeMenuItem.id}`);
    }
  };

  public transformPlaces = (yePlaces: TYEPlace[], coordinates: TCoordinates): TRestaurant[] =>
    yePlaces.map(place => this.transformPlace(place, coordinates));

  public transformMenuItems = (yeMenuItems: TYEMenuItem[], restaurant: TRestaurant): TMenuItem[] =>
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
            ingredients.push(ingredient);
          }
        });
    }

    return ingredients;
  };

  private extractMinimumOrder = (yePlace: TYEPlace): number | undefined => {
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

export const yeDataTransformer = new YEDataTransformer();
