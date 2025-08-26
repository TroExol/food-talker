import type { EDishCategory, TMenuItem } from '@/types/menuItem';
import type { TDatabaseConnection } from '@/services/database/types';
import type { EAvailableCities } from '@/config/bot/types';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { CityValidator } from '@/utils/CityValidator';
import { AppError } from '@/utils/AppError';
import { botConfig } from '@/config/bot';

import type {
  TMenuItemEntity,
  TVectorMenuItem,
  TVectorMenuSearchOptions,
  TVectorSearchResultItem,
} from './types';

export class MenuRepository {
  constructor(
    private readonly db: TDatabaseConnection,
  ) {}

  public create = async (menuItem: TVectorMenuItem): Promise<TVectorMenuItem> => {
    try {
      const expiresAt = new Date(Date.now() + botConfig.cache.ttlMenu * 1000).toISOString();

      await this.db.run(`
        INSERT INTO dishes (
          id, name, description, ingredients, price, image, available,
          restaurant_id, restaurant_name, restaurant_latitude, restaurant_longitude, order_url, category, embedding, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          ingredients = EXCLUDED.ingredients,
          price = EXCLUDED.price,
          image = EXCLUDED.image,
          available = EXCLUDED.available,
          restaurant_name = EXCLUDED.restaurant_name,
          restaurant_latitude = EXCLUDED.restaurant_latitude,
          restaurant_longitude = EXCLUDED.restaurant_longitude,
          order_url = EXCLUDED.order_url,
          category = EXCLUDED.category,
          embedding = EXCLUDED.embedding,
          expires_at = EXCLUDED.expires_at,
          updated_at = CURRENT_TIMESTAMP
      `, [
        menuItem.id,
        menuItem.name,
        menuItem.description,
        menuItem.ingredients,
        menuItem.price,
        menuItem.image,
        menuItem.available,
        menuItem.restaurant.id,
        menuItem.restaurant.name,
        menuItem.restaurant.coordinates.latitude,
        menuItem.restaurant.coordinates.longitude,
        menuItem.orderUrl,
        menuItem.category,
        `[${menuItem.embedding.join(',')}]`,
        expiresAt,
      ]);

      ConsoleLogger.info('Блюдо создано', { menuItemId: menuItem.id });
      return menuItem;
    } catch (error) {
      ConsoleLogger.error('Ошибка создания блюда', error as Error, { menuItemId: menuItem.id });
      throw AppError.databaseError('MENU_ITEM_CREATE_FAILED', 'Не удалось создать блюдо');
    }
  };

  public createBulk = async (menu: TVectorMenuItem[]): Promise<void> => {
    try {
      const expiresAt = new Date(Date.now() + botConfig.cache.ttlMenu * 1000).toISOString();

      await this.db.run(`
      INSERT INTO dishes (
        id, name, description, ingredients, price, image, available,
        restaurant_id, restaurant_name, restaurant_latitude, restaurant_longitude, order_url, category, embedding, expires_at
      ) VALUES $1
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        ingredients = EXCLUDED.ingredients,
        price = EXCLUDED.price,
        image = EXCLUDED.image,
        available = EXCLUDED.available,
        restaurant_name = EXCLUDED.restaurant_name,
        restaurant_latitude = EXCLUDED.restaurant_latitude,
        restaurant_longitude = EXCLUDED.restaurant_longitude,
        order_url = EXCLUDED.order_url,
        category = EXCLUDED.category,
        embedding = EXCLUDED.embedding,
        expires_at = EXCLUDED.expires_at,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
      `, [
        menu.map(item => [
          item.id,
          item.name,
          item.description,
          item.ingredients,
          item.price,
          item.image,
          item.available,
          item.restaurant.id,
          item.restaurant.name,
          item.restaurant.coordinates.latitude,
          item.restaurant.coordinates.longitude,
          item.orderUrl,
          item.category,
          `[${item.embedding.join(',')}]`,
          expiresAt,
        ]),
      ]);
    } catch (error) {
      ConsoleLogger.error('Ошибка создания блюд', error as Error, { menu });
      throw AppError.databaseError('MENU_ITEM_CREATE_BULK_FAILED', 'Не удалось создать блюда');
    }
  };

  public findById = async (menuItemId: string): Promise<TVectorSearchResultItem | null> => {
    try {
      const menuItemEntity = await this.db.get<TMenuItemEntity>(`
        SELECT * FROM dishes WHERE id = $1 AND expires_at > CURRENT_TIMESTAMP
      `, [menuItemId]);

      if (!menuItemEntity) {
        return null;
      }

      return this.entityToSearchResultItem(menuItemEntity);
    } catch (error) {
      ConsoleLogger.error('Ошибка поиска блюда', error as Error, { menuItemId });
      throw AppError.databaseError('MENU_ITEM_FIND_FAILED', 'Не удалось найти блюдо');
    }
  };

  public searchByEmbedding = async (
    queryEmbedding: number[],
    options: TVectorMenuSearchOptions = {},
  ): Promise<TVectorSearchResultItem[]> => {
    try {
      const {
        limit = 20,
        category,
        restaurantNames,
        minPrice,
        maxPrice,
        minSimilarity = 0.3,
        city,
        deliveryRadiusKm = 50,
      } = options;

      // Строим SQL запрос с фильтрами
      let sql = `
        SELECT 
          id, name, description, price, restaurant_id, restaurant_name, restaurant_latitude, restaurant_longitude, available, order_url, category, image, ingredients,
          1 - (embedding <=> $1) as similarity
        FROM dishes 
        WHERE available = true
          AND 1 - (embedding <=> $1) >= $2
          AND expires_at > CURRENT_TIMESTAMP
      `;

      const params: unknown[] = [`[${queryEmbedding.join(',')}]`, minSimilarity];
      let paramIndex = 3;

      // Фильтрация по городу (радиус доставки)
      if (city) {
        const cityCoords = CityValidator.getCityCoordinates(city as EAvailableCities);
        if (cityCoords) {
          // Используем формулу гаверсинуса для расчета расстояния
          sql += `
            AND (
              6371 * acos(
                cos(radians($${paramIndex})) * cos(radians(restaurant_latitude)) * 
                cos(radians(restaurant_longitude) - radians($${paramIndex + 1})) + 
                sin(radians($${paramIndex})) * sin(radians(restaurant_latitude))
              )
            ) <= $${paramIndex + 2}
          `;
          params.push(cityCoords.latitude, cityCoords.longitude, deliveryRadiusKm);
          paramIndex += 3;
        }
      }

      if (category) {
        sql += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (restaurantNames) {
        const restaurantNamesLower = restaurantNames.map(name => name.toLowerCase());
        sql += ` AND LOWER(restaurant_name) = ANY($${paramIndex})`;
        params.push(restaurantNamesLower);
        paramIndex++;
      }

      if (minPrice) {
        sql += ` AND price >= $${paramIndex}`;
        params.push(minPrice);
        paramIndex++;
      }

      if (maxPrice) {
        sql += ` AND price <= $${paramIndex}`;
        params.push(maxPrice);
        paramIndex++;
      }

      sql += ` ORDER BY embedding <=> $1 LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await this.db.query<TMenuItemEntity>(sql, params);

      const menu: TVectorSearchResultItem[] = result.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price,
        restaurant: {
          id: row.restaurant_id,
          name: row.restaurant_name,
          coordinates: {
            latitude: row.restaurant_latitude,
            longitude: row.restaurant_longitude,
          },
        },
        available: row.available,
        orderUrl: row.order_url,
        similarity: row.similarity,
        category: row.category as EDishCategory,
        image: row.image,
        tags: row.ingredients || [],
      }));

      ConsoleLogger.debug('Векторный поиск выполнен', {
        resultsCount: menu.length,
        maxSimilarity: menu[0]?.similarity,
      });

      return menu;
    } catch (error) {
      ConsoleLogger.error('Ошибка векторного поиска', error as Error);
      throw error;
    }
  };

  public update = async (
    menuItemId: string,
    updates: Partial<Pick<TMenuItem, 'name' | 'description' | 'ingredients' | 'price' | 'image' | 'available' | 'restaurant' | 'orderUrl' | 'category'>>,
  ): Promise<TVectorSearchResultItem> => {
    try {
      const setParts: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        setParts.push(`name = $${paramIndex}`);
        paramIndex++;
        values.push(updates.name);
      }
      if (updates.description !== undefined) {
        setParts.push(`description = $${paramIndex}`);
        paramIndex++;
        values.push(updates.description);
      }
      if (updates.ingredients !== undefined) {
        setParts.push(`ingredients = $${paramIndex}`);
        paramIndex++;
        values.push(updates.ingredients);
      }
      if (updates.price !== undefined) {
        setParts.push(`price = $${paramIndex}`);
        paramIndex++;
        values.push(updates.price);
      }
      if (updates.image !== undefined) {
        setParts.push(`image = $${paramIndex}`);
        paramIndex++;
        values.push(updates.image);
      }
      if (updates.available !== undefined) {
        setParts.push(`available = $${paramIndex}`);
        paramIndex++;
        values.push(updates.available);
      }
      if (updates.restaurant !== undefined) {
        setParts.push(`restaurant_id = $${paramIndex}`);
        paramIndex++;
        values.push(updates.restaurant.id);
        setParts.push(`restaurant_name = $${paramIndex}`);
        paramIndex++;
        values.push(updates.restaurant.name);
        if (updates.restaurant.coordinates) {
          setParts.push(`restaurant_latitude = $${paramIndex}`);
          paramIndex++;
          values.push(updates.restaurant.coordinates.latitude);
          setParts.push(`restaurant_longitude = $${paramIndex}`);
          paramIndex++;
          values.push(updates.restaurant.coordinates.longitude);
        }
      }
      if (updates.orderUrl !== undefined) {
        setParts.push(`order_url = $${paramIndex}`);
        paramIndex++;
        values.push(updates.orderUrl);
      }
      if (updates.category !== undefined) {
        setParts.push(`category = $${paramIndex}`);
        paramIndex++;
        values.push(updates.category);
      }

      if (setParts.length === 0) {
        throw AppError.validationError('NO_UPDATES', 'Нет данных для обновления');
      }

      setParts.push(`updated_at = $${paramIndex}`);
      paramIndex++;
      values.push(new Date().toISOString());
      values.push(menuItemId);

      const result = await this.db.run(`
        UPDATE dishes SET ${setParts.join(', ')} WHERE id = $${paramIndex}
      `, values);

      if (result.changes === 0) {
        throw AppError.menuItemNotFound(menuItemId);
      }

      const updatedMenuItem = await this.findById(menuItemId);
      if (!updatedMenuItem) {
        throw AppError.systemError('MENU_ITEM_UPDATE_INCONSISTENT', 'Блюдо обновлено но не найдено');
      }

      ConsoleLogger.info('Блюдо обновлено', { menuItemId, updates });
      return updatedMenuItem;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      ConsoleLogger.error('Ошибка обновления блюда', error as Error, { menuItemId });
      throw AppError.databaseError('MENU_ITEM_UPDATE_FAILED', 'Не удалось обновить блюдо');
    }
  };

  public delete = async (menuItemId: string): Promise<boolean> => {
    try {
      const result = await this.db.run(`DELETE FROM dishes WHERE id = $1`, [menuItemId]);

      const deleted = result.changes > 0;
      if (deleted) {
        ConsoleLogger.info('Блюдо удалено', { menuItemId });
      }

      return deleted;
    } catch (error) {
      ConsoleLogger.error('Ошибка удаления блюда', error as Error, { menuItemId });
      throw AppError.databaseError('MENU_ITEM_DELETE_FAILED', 'Не удалось удалить блюдо');
    }
  };

  public getMenuCount = async (): Promise<number> => {
    try {
      const result = await this.db.get<{ count: string }>('SELECT COUNT(*) as count FROM dishes WHERE expires_at > CURRENT_TIMESTAMP');

      return parseInt(result?.count || '0', 10);
    } catch (error) {
      ConsoleLogger.error('Ошибка получения количества блюд', error as Error);
      throw error;
    }
  };

  public cleanupExpiredDishes = async (): Promise<number> => {
    try {
      const result = await this.db.run(`
        DELETE FROM dishes 
        WHERE expires_at <= CURRENT_TIMESTAMP
      `);

      const deletedCount = result.changes;
      if (deletedCount > 0) {
        ConsoleLogger.info('Очищены просроченные блюда', { deletedCount });
      }

      return deletedCount;
    } catch (error) {
      ConsoleLogger.error('Ошибка очистки просроченных блюд', error as Error);
      throw AppError.databaseError('CLEANUP_EXPIRED_DISHES_FAILED', 'Не удалось очистить просроченные блюда');
    }
  };

  private entityToSearchResultItem = (entity: TMenuItemEntity): TVectorSearchResultItem => {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      tags: entity.ingredients,
      price: entity.price,
      image: entity.image,
      restaurant: {
        id: entity.restaurant_id,
        name: entity.restaurant_name,
        coordinates: {
          latitude: entity.restaurant_latitude,
          longitude: entity.restaurant_longitude,
        },
      },
      orderUrl: entity.order_url,
      category: entity.category as EDishCategory,
      similarity: entity.similarity,
    };
  };
}
