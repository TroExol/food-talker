import { Pool } from 'pg';

import type { EDishCategory, TMenuItem } from '@/types/menuItem';

import { ConsoleLogger } from '@/utils/ConsoleLogger';

import type { EmbeddingService } from './EmbeddingService';

interface TVectorSearchConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  maxConnections: number;
}

interface TVectorSearchResult {
  id: string;
  name: string;
  description: string;
  price: number;
  restaurant: {
    id: string;
    name: string;
  };
  orderUrl: string;
  similarity: number;
  category: EDishCategory;
  image: string;
  ingredients: string[];
}

interface TDatabaseRow {
  id: string;
  name: string;
  description: string;
  price: number;
  restaurant_id: string;
  restaurant_name: string;
  order_url: string;
  similarity: number;
  category: EDishCategory;
  image: string;
  ingredients: string[];
}

export class VectorSearchService {
  private pool: Pool;

  constructor(
    private readonly embeddingService: EmbeddingService,
    config: TVectorSearchConfig,
  ) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.maxConnections,
    });

    void this.initializeDatabase();
  }

  private initializeDatabase = async (): Promise<void> => {
    try {
      const client = await this.pool.connect();

      // Создаем расширение pgvector
      await client.query('CREATE EXTENSION IF NOT EXISTS vector;');

      // Создаем таблицу для блюд с векторами
      await client.query(`
        CREATE TABLE IF NOT EXISTS dishes (
          id VARCHAR(255) PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          ingredients TEXT[],
          price INTEGER NOT NULL,
          image TEXT,
          available BOOLEAN DEFAULT true,
          restaurant_id VARCHAR(255) NOT NULL,
          restaurant_name TEXT NOT NULL,
          order_url TEXT NOT NULL,
          category VARCHAR(50) NOT NULL,
          embedding vector(768),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Создаем HNSW индекс для косинусного поиска
      await client.query(`
        CREATE INDEX IF NOT EXISTS dishes_embedding_cosine_idx 
        ON dishes USING hnsw (embedding vector_cosine_ops);
      `);

      // Создаем индексы для фильтрации
      await client.query('CREATE INDEX IF NOT EXISTS dishes_category_idx ON dishes(category);');
      await client.query('CREATE INDEX IF NOT EXISTS dishes_restaurant_id_idx ON dishes(restaurant_id);');
      await client.query('CREATE INDEX IF NOT EXISTS dishes_available_idx ON dishes(available);');
      await client.query('CREATE INDEX IF NOT EXISTS dishes_price_idx ON dishes(price);');

      client.release();
      ConsoleLogger.info('База данных векторного поиска инициализирована');
    } catch (error) {
      ConsoleLogger.error('Ошибка инициализации базы данных векторного поиска', error as Error);
      throw error;
    }
  };

  public generateEmbedding = async (text: string): Promise<number[]> => {
    try {
      return await this.embeddingService.generateEmbedding(text);
    } catch (error) {
      ConsoleLogger.error('Ошибка генерации эмбеддинга', error as Error, { text });
      throw error;
    }
  };

  public upsertMenuItem = async (menuItem: TMenuItem): Promise<void> => {
    try {
      const client = await this.pool.connect();

      // Генерируем эмбеддинг для названия и описания блюда
      const textForEmbedding = `${menuItem.name} ${menuItem.description}`.trim();
      const embedding = await this.generateEmbedding(textForEmbedding);

      await client.query(`
        INSERT INTO dishes (
          id, name, description, ingredients, price, image, available,
          restaurant_id, restaurant_name, order_url, category, embedding
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          ingredients = EXCLUDED.ingredients,
          price = EXCLUDED.price,
          image = EXCLUDED.image,
          available = EXCLUDED.available,
          restaurant_name = EXCLUDED.restaurant_name,
          order_url = EXCLUDED.order_url,
          category = EXCLUDED.category,
          embedding = EXCLUDED.embedding,
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
        menuItem.orderUrl,
        menuItem.category,
        `[${embedding.join(',')}]`,
      ]);

      client.release();
      ConsoleLogger.debug('Блюдо добавлено в векторную базу', { menuItemId: menuItem.id });
    } catch (error) {
      ConsoleLogger.error('Ошибка добавления блюда в векторную базу', error as Error, { menuItemId: menuItem.id });
      throw error;
    }
  };

  public searchMenu = async (
    naturalQuery: string,
    options: {
      limit?: number;
      category?: EDishCategory;
      restaurantNames?: string[];
      minPrice?: number;
      maxPrice?: number;
      minSimilarity?: number;
    } = {},
  ): Promise<TVectorSearchResult[]> => {
    try {
      const {
        limit = 20,
        category,
        restaurantNames,
        minPrice,
        maxPrice,
        minSimilarity = 0.3,
      } = options;

      // Генерируем эмбеддинг для запроса
      const queryEmbedding = await this.generateEmbedding(naturalQuery);

      const client = await this.pool.connect();

      // Строим SQL запрос с фильтрами
      let sql = `
        SELECT 
          id, name, description, price, restaurant_id, restaurant_name, order_url, category, image, ingredients,
          1 - (embedding <=> $1) as similarity
        FROM dishes 
        WHERE available = true
          AND 1 - (embedding <=> $1) >= $2
      `;

      const params: unknown[] = [`[${queryEmbedding.join(',')}]`, minSimilarity];
      let paramIndex = 3;

      if (category) {
        sql += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (restaurantNames) {
        // проверка с нижним регистром
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

      const result = await client.query(sql, params);
      client.release();

      const menu: TVectorSearchResult[] = result.rows.map((row: TDatabaseRow) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price,
        restaurant: {
          id: row.restaurant_id,
          name: row.restaurant_name,
        },
        orderUrl: row.order_url,
        similarity: row.similarity,
        category: row.category,
        image: row.image,
        ingredients: row.ingredients,
      }));

      ConsoleLogger.debug('Векторный поиск выполнен', {
        query: naturalQuery,
        resultsCount: menu.length,
        maxSimilarity: menu[0]?.similarity,
      });

      return menu;
    } catch (error) {
      ConsoleLogger.error('Ошибка векторного поиска', error as Error, { query: naturalQuery });
      throw error;
    }
  };

  public deleteMenuItem = async (menuItemId: string): Promise<void> => {
    try {
      const client = await this.pool.connect();
      await client.query('DELETE FROM dishes WHERE id = $1', [menuItemId]);
      client.release();

      ConsoleLogger.debug('Блюдо удалено из векторной базы', { menuItemId });
    } catch (error) {
      ConsoleLogger.error('Ошибка удаления блюда из векторной базы', error as Error, { menuItemId });
      throw error;
    }
  };

  public getMenuCount = async (): Promise<number> => {
    try {
      const client = await this.pool.connect();
      const result = await client.query<{ count: string }>('SELECT COUNT(*) as count FROM dishes');
      client.release();

      return parseInt(result.rows[0].count);
    } catch (error) {
      ConsoleLogger.error('Ошибка получения количества блюд', error as Error);
      throw error;
    }
  };

  public close = async (): Promise<void> => {
    await this.pool.end();
  };
}
