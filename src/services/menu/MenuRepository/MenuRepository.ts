import type { TSearchResultItem } from '@/types/search';
import type { EDishCategory, TMenuItem } from '@/types/menuItem';
import type { TDatabaseConnection } from '@/services/database/types';
import type { EAvailableCities } from '@/config/bot/types';

import { ConsoleLogger } from '@/utils/ConsoleLogger';
import { CityValidator } from '@/utils/CityValidator';
import { AppError } from '@/utils/AppError';
import { botConfig } from '@/config/bot';

import type {
  TMenuItemEntity,
  TMenuItemEntityWithEmbedding,
  TMenuItemEntityWithSimilarity,
  TMenuSearchOptions,
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

      // Дедуплицируем данные по id, оставляя последнюю версию
      const uniqueMenu = new Map<string, TVectorMenuItem>();
      menu.forEach(item => {
        uniqueMenu.set(`${item.id}-${item.restaurant.id}`, item);
      });

      const deduplicatedMenu = Array.from(uniqueMenu.values());

      // Используем множественные VALUES для bulk insert
      const values = deduplicatedMenu.map((item, index) => {
        const baseIndex = index * 15;
        return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11}, $${baseIndex + 12}, $${baseIndex + 13}, $${baseIndex + 14}::vector, $${baseIndex + 15})`;
      }).join(', ');

      // Подготавливаем параметры
      const params: unknown[] = [];
      deduplicatedMenu.forEach(item => {
        params.push(
          item.id,
          item.name,
          item.description,
          JSON.stringify(item.ingredients),
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
        );
      });

      await this.db.run(`
        INSERT INTO dishes (
          id, name, description, ingredients, price, image, available,
          restaurant_id, restaurant_name, restaurant_latitude, restaurant_longitude, order_url, category, embedding, expires_at
        ) VALUES ${values}
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
      `, params);

      ConsoleLogger.info('Блюда созданы', {
        menuCount: menu.length,
        uniqueCount: deduplicatedMenu.length,
        duplicatesRemoved: menu.length - deduplicatedMenu.length,
      });
    } catch (error) {
      ConsoleLogger.error('Ошибка создания блюд', error as Error, { menuCount: menu.length });
      throw AppError.databaseError('MENU_ITEM_CREATE_BULK_FAILED', 'Не удалось создать блюда');
    }
  };

  public findById = async (menuItemId: string): Promise<TSearchResultItem | null> => {
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

  public search = async (options: TMenuSearchOptions = {}): Promise<TSearchResultItem[]> => {
    try {
      const {
        limit = 20,
        ids,
        category,
        restaurantNames,
        minPrice,
        maxPrice,
        city,
        deliveryRadiusKm = 50,
        available = true,
      } = options;

      // Строим SQL запрос с фильтрами
      let sql = `
        SELECT 
          id, name, description, price, restaurant_id, restaurant_name, restaurant_latitude, restaurant_longitude, available, order_url, category, image, ingredients, expires_at
        FROM dishes
        WHERE expires_at > CURRENT_TIMESTAMP
      `;

      const params: unknown[] = [];
      let paramIndex = 1;

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

      if (ids?.length) {
        sql += ` AND id = ANY($${paramIndex})`;
        params.push(ids);
        paramIndex++;
      }

      if (category) {
        sql += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (restaurantNames?.length) {
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

      if (available) {
        sql += ` AND available = $${paramIndex}`;
        params.push(available);
        paramIndex++;
      }

      if (limit) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(limit);
        paramIndex++;
      }

      const result = await this.db.query<TMenuItemEntity>(sql, params);

      const menu: TSearchResultItem[] = result.map(row => ({
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
        category: row.category as EDishCategory,
        image: row.image,
        tags: JSON.parse(row.ingredients) as string[] || [],
      }));

      ConsoleLogger.debug('Поиск меню выполнен', {
        resultsCount: menu.length,
      });

      return menu;
    } catch (error) {
      ConsoleLogger.error('Ошибка поиска меню', error as Error);
      throw error;
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
        available = true,
      } = options;

      // Строим SQL запрос с фильтрами
      let sql = `
        SELECT 
          id, name, description, price, restaurant_id, restaurant_name, restaurant_latitude, restaurant_longitude, available, order_url, category, image, ingredients,
          1 - (embedding <=> $1) as similarity
        FROM dishes 
        WHERE 1 = 1
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

      if (restaurantNames?.length) {
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

      if (available) {
        sql += ` AND available = $${paramIndex}`;
        params.push(available);
        paramIndex++;
      }

      sql += ` ORDER BY embedding <=> $1 LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await this.db.query<TMenuItemEntityWithSimilarity>(sql, params);

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
        tags: JSON.parse(row.ingredients) as string[] || [],
      }));

      ConsoleLogger.debug('Векторный поиск меню выполнен', {
        resultsCount: menu.length,
        maxSimilarity: menu[0]?.similarity,
      });

      return menu;
    } catch (error) {
      ConsoleLogger.error('Ошибка векторного поиска меню', error as Error);
      throw error;
    }
  };

  public update = async (
    menuItemId: string,
    updates: Partial<Pick<TMenuItem, 'name' | 'description' | 'ingredients' | 'price' | 'image' | 'available' | 'restaurant' | 'orderUrl' | 'category'>>,
  ): Promise<TSearchResultItem> => {
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
        values.push(JSON.stringify(updates.ingredients));
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
      setParts.push(`expires_at = $${paramIndex}`);
      paramIndex++;
      values.push(new Date(Date.now() + botConfig.cache.ttlMenu * 1000).toISOString());
      values.push(menuItemId);

      const result = await this.db.run(`
        UPDATE dishes SET ${setParts.join(', ')} WHERE id = $${paramIndex}
      `, values);

      if (result.changes === 0) {
        throw AppError.menuItemNotFound(menuItemId);
      }

      const updatedMenuItem = await this.findById(menuItemId);
      if (!updatedMenuItem) {
        throw AppError.systemError('MENU_ITEM_UPDATE_INCONSISTENT', 'Блюдо обновлено, но не найдено');
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

  public updateBulk = async (
    items: Array<{
      id: string;
      updates: Partial<Pick<TMenuItem, 'name' | 'description' | 'ingredients' | 'price' | 'image' | 'available' | 'restaurant' | 'orderUrl' | 'category'>>;
    }>,
  ): Promise<number> => {
    try {
      if (!items.length) {
        return 0;
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + botConfig.cache.ttlMenu * 1000).toISOString();
      const updatedAt = now.toISOString();

      // Build VALUES rows: (id, name, description, ingredients, price, image, available,
      //                    restaurant_id, restaurant_name, restaurant_latitude, restaurant_longitude,
      //                    order_url, category, updated_at, expires_at)
      const colsPerRow = 15;
      const valuesSql = items
        .map((_, i) => {
          const base = i * colsPerRow;
          return `($${base + 1}::varchar, $${base + 2}::text, $${base + 3}::text, $${base + 4}::text, $${base + 5}::integer, $${base + 6}::text, $${base + 7}::boolean, $${base + 8}::varchar, $${base + 9}::text, $${base + 10}::decimal(10,8), $${base + 11}::decimal(11,8), $${base + 12}::text, $${base + 13}::varchar(50), $${base + 14}::text, $${base + 15}::timestamp)`;
        })
        .join(', ');

      const params: unknown[] = [];
      for (const { id, updates } of items) {
        // primitives or nulls for COALESCE logic
        params.push(
          id,
          updates.name ?? null,
          updates.description ?? null,
          // store ingredients as JSON text when provided
          updates.ingredients !== undefined ? JSON.stringify(updates.ingredients) : null,
          updates.price ?? null,
          updates.image ?? null,
          updates.available ?? null,
          updates.restaurant?.id ?? null,
          updates.restaurant?.name ?? null,
          updates.restaurant?.coordinates?.latitude ?? null,
          updates.restaurant?.coordinates?.longitude ?? null,
          updates.orderUrl ?? null,
          updates.category ?? null,
          updatedAt,
          expiresAt,
        );
      }

      const sql = `
        UPDATE dishes AS d
        SET
          name = COALESCE(v.name, d.name),
          description = COALESCE(v.description, d.description),
          ingredients = COALESCE(v.ingredients, d.ingredients),
          price = COALESCE(v.price, d.price),
          image = COALESCE(v.image, d.image),
          available = COALESCE(v.available, d.available),
          restaurant_id = COALESCE(v.restaurant_id, d.restaurant_id),
          restaurant_name = COALESCE(v.restaurant_name, d.restaurant_name),
          restaurant_latitude = COALESCE(v.restaurant_latitude, d.restaurant_latitude),
          restaurant_longitude = COALESCE(v.restaurant_longitude, d.restaurant_longitude),
          order_url = COALESCE(v.order_url, d.order_url),
          category = COALESCE(v.category, d.category),
          updated_at = v.updated_at,
          expires_at = v.expires_at
        FROM (
          VALUES ${valuesSql}
        ) AS v(
          id, name, description, ingredients, price, image, available,
          restaurant_id, restaurant_name, restaurant_latitude, restaurant_longitude,
          order_url, category, updated_at, expires_at
        )
        WHERE d.id = v.id
      `;

      const result = await this.db.run(sql, params);

      ConsoleLogger.info('Блюда обновлены', {
        itemsCount: items.length,
        updatedRows: result.changes,
      });

      return result.changes;
    } catch (error) {
      ConsoleLogger.error('Ошибка обновления блюд', error as Error, { itemsCount: items.length });
      throw AppError.databaseError('MENU_ITEM_UPDATE_BULK_FAILED', 'Не удалось обновить блюда');
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

  public unavailableExpiredDishes = async (): Promise<number> => {
    try {
      const result = await this.db.run(`
        UPDATE dishes 
        SET available = false
        WHERE expires_at <= CURRENT_TIMESTAMP
      `);

      const deletedCount = result.changes;
      if (deletedCount > 0) {
        ConsoleLogger.info('Установлены недоступные просроченные блюда', { deletedCount });
      }

      return deletedCount;
    } catch (error) {
      ConsoleLogger.error('Ошибка установки недоступных просроченных блюд', error as Error);
      throw AppError.databaseError('UNAVAILABLE_EXPIRED_DISHES_FAILED', 'Не удалось установить недоступные просроченные блюда');
    }
  };

  private entityToVectorSearchResultItem = (entity: TMenuItemEntityWithSimilarity): TVectorSearchResultItem => {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      tags: JSON.parse(entity.ingredients) as string[] || [],
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
      available: entity.available,
    };
  };

  private entityToSearchResultItem = (entity: TMenuItemEntity): TSearchResultItem => {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      tags: JSON.parse(entity.ingredients) as string[] || [],
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
      available: entity.available,
    };
  };

  public searchWithEmbeddings = async (options: TMenuSearchOptions = {}): Promise<TVectorMenuItem[]> => {
    try {
      const {
        limit = null,
        ids,
        category,
        restaurantNames,
        minPrice,
        maxPrice,
        city,
        deliveryRadiusKm = 50,
        available = null,
      } = options;

      // Строим SQL запрос с фильтрами
      let sql = `
        SELECT
          id, name, description, price, restaurant_id, restaurant_name, restaurant_latitude, restaurant_longitude, available, order_url, category, image, ingredients, embedding
        FROM dishes
        WHERE
          embedding IS NOT NULL
          AND expires_at > CURRENT_TIMESTAMP
      `;

      const params: unknown[] = [];
      let paramIndex = 1;

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

      if (ids?.length) {
        sql += ` AND id = ANY($${paramIndex})`;
        params.push(ids);
        paramIndex++;
      }

      if (restaurantNames?.length) {
        sql += ` AND restaurant_name = ANY($${paramIndex})`;
        params.push(restaurantNames);
        paramIndex++;
      }

      if (category) {
        sql += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (available !== null) {
        sql += ` AND available = $${paramIndex}`;
        params.push(available);
        paramIndex++;
      }

      if (minPrice !== null && minPrice !== undefined) {
        sql += ` AND price >= $${paramIndex}`;
        params.push(minPrice);
        paramIndex++;
      }

      if (maxPrice !== null && maxPrice !== undefined) {
        sql += ` AND price <= $${paramIndex}`;
        params.push(maxPrice);
        paramIndex++;
      }

      if (limit !== null && limit !== undefined) {
        sql += ` ORDER BY updated_at DESC LIMIT $${paramIndex}`;
        params.push(limit);
      } else {
        sql += ` ORDER BY updated_at DESC`;
      }

      const result = await this.db.query<TMenuItemEntityWithEmbedding>(sql, params);

      const menu: TVectorMenuItem[] = result.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        ingredients: JSON.parse(row.ingredients) as string[] || [],
        price: row.price,
        image: row.image,
        available: row.available,
        restaurant: {
          id: row.restaurant_id,
          name: row.restaurant_name,
          coordinates: {
            latitude: row.restaurant_latitude,
            longitude: row.restaurant_longitude,
          },
          lastUpdated: new Date(), // Используем текущее время как fallback
        },
        orderUrl: row.order_url,
        category: row.category as EDishCategory,
        embedding: JSON.parse(row.embedding) as number[],
      }));

      ConsoleLogger.debug('Поиск меню с эмбедингами выполнен', {
        resultsCount: menu.length,
        restaurantNames: restaurantNames?.length,
      });

      return menu;
    } catch (error) {
      ConsoleLogger.error('Ошибка поиска меню с эмбедингами', error as Error);
      throw error;
    }
  };
}
