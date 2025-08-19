# Design Document

## Overview

Система представляет собой Telegram-бот для поиска еды, использующий нейро-поиск по ресторанам и агрегаторам. Бот построен на Node.js с TypeScript, использует Telegraf.js для работы с Telegram Bot API и интегрируется с LLM (Llama 3.1 8B) для обработки естественного языка.

## Architecture

### High-Level Architecture

```
[Telegram User] 
    ↓
[Telegram Bot API] 
    ↓
[Telegraf Bot Framework]
    ↓
[Bot Application Layer]
    ↓
┌─────────────────┬─────────────────┬─────────────────┐
│   User Service  │  Search Service │  Data Service   │
└─────────────────┴─────────────────┴─────────────────┘
    ↓                    ↓                    ↓
[User Database]    [LLM Service]       [Food Aggregators]
                   [Cache Layer]       [Yandex.Eda API]
```

### Core Components

1. **Bot Layer** - Обработка Telegram команд и сообщений
2. **Business Logic Layer** - Основная логика приложения
3. **Data Access Layer** - Взаимодействие с внешними API и базой данных
4. **AI Integration Layer** - Интеграция с LLM для обработки запросов

## Components and Interfaces

### 1. Bot Handler (`src/bot/`)

**BotHandler** - Главный класс для обработки Telegram updates
```typescript
interface TBotHandler {
  start(): Promise<void>
  stop(): Promise<void>
  handleMessage(ctx: TTelegrafContext): Promise<void>
  handleCommand(ctx: TTelegrafContext): Promise<void>
}
```

**CommandHandlers** - Обработчики команд
- `/start` - Регистрация нового пользователя
- `/help` - Справочная информация
- `/address` - Изменение города доставки
- `/history` - История поисков
- `/cancel` - Отмена текущего действия

### 2. User Management (`src/services/user/`)

**UserService** - Управление пользователями
```typescript
interface TUserService {
  createUser(telegramId: number, chatId: number): Promise<TUser>
  getUser(telegramId: number): Promise<TUser | null>
  updateUserCity(telegramId: number, city: string): Promise<TUser>
  updateSubscription(telegramId: number, subscription: TSubscriptionType): Promise<TUser>
  checkSubscriptionExpiry(): Promise<TUser[]>
}

interface TUser {
  telegramId: number
  chatId: number
  city: EAvailableCities
  subscription: ESubscriptionType
  subscriptionExpiry: Date
  createdAt: Date
  updatedAt: Date
}

enum ESubscriptionType {
  BASIC = 'basic',
}

enum EAvailableCities {
  PERM = 'Пермь',
  VORONEZH = 'Воронеж',
}
```

### 3. Search Engine (`src/services/search/`)

**SearchService** - Основной поисковый сервис
```typescript
interface TSearchService {
  searchFood(query: string, userId: number): Promise<TSearchResult[]>
  processNaturalLanguageQuery(query: string): Promise<TStructuredQuery>
  filterByGeolocation(results: TSearchResult[], city: string): Promise<TSearchResult[]>
  enhanceResultsWithLLM(results: TSearchResult[], originalQuery: string): Promise<TSearchResult[]>
}

interface TStructuredQuery {
  restaurants?: string[]
  ingredients?: string[]
  priceRange?: TPriceRange
  exclusions?: {
    restaurants?: string[]
    ingredients?: string[]
    priceRange?: TPriceRange
  }
}

interface TPriceRange {
  min: number
  max: number
}

interface TSearchResult {
  id: string
  name: string
  restaurant: TRestaurantInfo
  description: string
  ingredients: string[]
  price: number
  image?: string
  orderUrl: string
}
```

**LLMService** - Интеграция с Llama 3.1 8B
```typescript
interface TLLMService {
  transformQuery(naturalQuery: string): Promise<TStructuredQuery>
  enhanceSearchResults(results: TSearchResult[], query: string): Promise<TSearchResult[]>
  validateQueryStructure(query: TStructuredQuery): boolean
}
```

### 4. Data Aggregation (`src/services/data/`)

**YandexEdaService** - Интеграция с Яндекс.Еда
```typescript
interface TYandexEdaService {
  getPlaces(coordinates: TCoordinates): Promise<TRestaurant[]>
  getPlaceMenu(placeSlug: string, coordinates: TCoordinates): Promise<TMenuItem[]>
  searchItems(query: TStructuredQuery, coordinates: TCoordinates): Promise<TMenuItem[]>
}

interface TYERestaurant {
  id: string
  name: string
  coordinates: TCoordinates
  workingHours: TWorkingHours
  minimumOrderAmount?: number
  isActive: boolean
  lastUpdated: Date
  additionalInfo: {
    brandSlug: string
  }
}

interface TYEMenuItem {
  id: string
  name: string
  description: string
  ingredients: string[]
  price: number
  image?: string
  available: boolean
  restaurant: TYERestaurant
}
```

**DataCollectionService** - Сбор и обновление данных
```typescript
interface TDataCollectionService {
  startCollection(): Promise<void>
  updateRestaurantData(): Promise<void>
  scheduleUpdates(): void
  getCachedData(key: string): Promise<any>
  setCachedData(key: string, data: any, ttl: number): Promise<void>
}
```

### 5. Geolocation (`src/services/geo/`)

**GeolocationService** - Работа с геолокацией
```typescript
interface TGeolocationService {
  getCityCoordinates(cityName: string): Promise<TCoordinates>
  isDeliveryAvailable(restaurant: TRestaurant, userCity: string): Promise<boolean>
  filterByDeliveryZone(restaurants: TRestaurant[], city: string): Promise<TRestaurant[]>
}

interface TCoordinates {
  latitude: number
  longitude: number
}
```

### 6. Message Formatting (`src/services/message/`)

**MessageFormatter** - Форматирование сообщений
```typescript
interface TMessageFormatter {
  formatSearchResults(results: TSearchResult[]): string
  formatRestaurantCard(restaurant: TRestaurant, items: TMenuItem[]): string
  formatWelcomeMessage(user: TUser): string
  formatErrorMessage(error: TAppError): string
  createInlineKeyboard(results: TSearchResult[]): TInlineKeyboardMarkup
}
```

## Data Models

### Core Entities

```typescript
// User Entity
interface TUser {
  telegramId: number
  chatId: number
  city: EAvailableCities
  subscription: TSubscriptionType
  subscriptionExpiry: Date
  searchHistory: TSearchHistoryItem[]
  createdAt: Date
  updatedAt: Date
}

// Search History
interface TSearchHistoryItem {
  id: string
  query: string
  structuredQuery: TStructuredQuery
  results: TSearchResult[]
  timestamp: Date
}

// Restaurant Data
interface TRestaurant {
  id: string
  name: string
  coordinates: TCoordinates
  workingHours: TWorkingHours
  minimumOrderAmount?: number
  isActive: boolean
  lastUpdated: Date
  additionalInfo?: object
}

// Menu Item
interface TMenuItem {
  id: string
  name: string
  description: string
  ingredients: string[]
  price: number
  image?: string
  available: boolean
  restaurant: TRestaurant
}

interface TWorkingHours {
  open: string // HH:MM
  close: string // HH:MM
  isOpen: boolean
}
```

### Configuration Models

```typescript
interface TBotConfig {
  telegramToken: string
  llmApiUrl: string
  llmApiKey: string
  database: TDatabaseConfig
  cache: TCacheConfig
  yandexEda: TYandexEdaConfig
}

interface TDatabaseConfig {
  host: string
  port: number
  database: string
  username: string
  password: string
}

interface TCacheConfig {
  ttl: number
  maxSize: number
  type: 'memory' | 'redis'
  redisUrl?: string
}

interface TYandexEdaConfig {
  baseUrl: string
  headers: Record<string, string>
  rateLimits: {
    requestsPerMinute: number
    requestsPerHour: number
  }
}
```

## Error Handling

### Error Types

```typescript
enum TErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  LLM_ERROR = 'LLM_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  CITY_NOT_SUPPORTED = 'CITY_NOT_SUPPORTED'
}

interface TAppError extends Error {
  type: TErrorType
  code: string
  details?: any
  isUserFacing: boolean
}
```

### Error Handling Strategy

1. **User-Facing Errors** - Понятные сообщения пользователю
2. **System Errors** - Логирование и уведомление администратора
3. **Graceful Degradation** - Продолжение работы при сбоях отдельных компонентов
4. **Retry Logic** - Автоматические повторы для временных сбоев

### Error Recovery

```typescript
interface TErrorHandler {
  handleBotError(error: TAppError, ctx: TTelegrafContext): Promise<void>
  handleAPIError(error: TAppError): Promise<void>
  handleLLMError(error: TAppError, fallbackStrategy: 'simple_search' | 'cached_results'): Promise<TSearchResult[]>
  notifyAdmin(error: TAppError): Promise<void>
}
```

## Performance and Caching

### Caching Strategy

1. **User Data Cache** - Кэширование профилей пользователей (TTL: 1 час)
2. **Restaurant Data Cache** - Кэширование данных ресторанов (TTL: 1 час)
3. **Search Results Cache** - Кэширование результатов поиска (TTL: 15 минут)
4. **LLM Response Cache** - Кэширование ответов LLM для похожих запросов (TTL: 24 часа)

### Rate Limiting

```typescript
interface TRateLimiter {
  checkUserLimit(userId: number, action: string): Promise<boolean>
  checkAPILimit(service: string): Promise<boolean>
  incrementCounter(key: string): Promise<void>
}

// Лимиты:
// - Пользователи: 10 запросов в минуту
// - Яндекс.Еда API: 100 запросов в минуту
// - LLM API: 50 запросов в минуту
```

## Integration Patterns

### Yandex.Eda Integration

Основано на существующих research файлах:

```typescript
class YandexEdaClient {
  private baseUrl = 'https://eda.yandex.ru'
  private headers = {
    'Content-Type': 'application/json',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'x-app-version': '17.52.4',
    'x-platform': 'desktop_web'
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    'x-client-session': 'mei8lrkd-d49t83iglm-2sset7rzpp6-8qnt1cacvd',
    'x-device-id': 'mei8lrkd-fnbl951fo7-vqvkmfvgb8f-cgrtjueuxx8'
    'x-taxi': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 platform=eats_desktop_web',
    'x-ya-client-time': new Date().toISOString(),
    'x-ya-coordinates': 'latitude=58.010454,longitude=56.229441',
  }

  async getPlaces(coordinates: TCoordinates): Promise<TRestaurant[]> // Additional Header 'x-retpath-y': 'https://eda.yandex.ru/perm?shippingType=delivery'
  async getPlaceMenu(placeSlug: string, coordinates: TCoordinates): Promise<TMenuItem[]> // Additional Header 'x-retpath-y': `https://eda.yandex.ru/r/${placeBrandSlug}?placeSlug=${placeSlug}`
  async searchByCategory(category: string, coordinates: TCoordinates): Promise<TMenuItem[]>
}
```

### LLM Integration

```typescript
interface TLLMClient {
  transformQuery(query: string): Promise<TStructuredQuery>
  enhanceResults(results: TSearchResult[], originalQuery: string): Promise<TSearchResult[]>
  validateResponse(response: any): boolean
}

class LlamaService implements TLLMClient {
  private apiUrl: string
  private apiKey: string
  
  async transformQuery(query: string): Promise<TStructuredQuery> {
    // Преобразование естественного запроса в структурированный JSON
    const prompt = this.buildQueryTransformPrompt(query)
    const response = await this.callLLM(prompt)
    return this.parseStructuredQuery(response)
  }
}
```

### Database Schema

```typescript
// Users Table
interface TUserEntity {
  telegram_id: number // PRIMARY KEY
  chat_id: number
  city: string
  subscription_type: string
  subscription_expiry: string // ISO string
  created_at: string // ISO string
  updated_at: string // ISO string
}

// Search History Table
interface TSearchHistoryEntity {
  id: string // UUID PRIMARY KEY
  user_telegram_id: number // FOREIGN KEY
  query: string
  structured_query: string // JSON string
  results_count: number
  created_at: string // ISO string
}

// Restaurants Cache Table
interface TRestaurantCacheEntity {
  id: string // PRIMARY KEY
  name: string
  data: string // JSON string
  city: EAvailableCities
  last_updated: string // ISO string
  is_active: number
}
```

## Testing Strategy

### Unit Testing используя vitest, memfs

1. **Service Layer Tests**
   - UserService методы
   - SearchService логика
   - LLMService трансформации
   - YandexEdaService API calls

2. **Utility Function Tests**
   - Query parsing
   - Data validation
   - Error handling

### Integration Testing

1. **Bot Command Tests**
   - Тестирование команд через mock Telegram updates
   - Проверка flow регистрации пользователя
   - Тестирование поискового flow

2. **External API Tests**
   - Mock тесты для Yandex.Eda API
   - Mock тесты для LLM API
   - Тестирование error handling

### End-to-End Testing

1. **User Journey Tests**
   - Полный цикл: регистрация → поиск → результаты
   - Тестирование edge cases
   - Performance тесты

## Security Considerations

### Data Protection

1. **API Keys Security**
   - Хранение в environment variables
   - Ротация ключей
   - Шифрование sensitive данных

2. **User Data Privacy**
   - Минимизация хранимых данных
   - Соблюдение ФЗ-152
   - Автоматическое удаление старых данных

3. **Rate Limiting & DDoS Protection**
   - Лимиты на пользователя
   - Лимиты на IP
   - Graceful degradation

### Input Validation

```typescript
interface TValidator {
  // Input validation (from user)
  validateSearchQuery(query: string): TValidationResult
  validateCity(city: string): TValidationResult
  validateTelegramId(telegramId: number): TValidationResult
  validateChatId(chatId: number): TValidationResult
  validateSubscriptionType(subscription: string): TValidationResult
  
  // Business logic validation (internal structures)
  validatePriceRange(min?: number, max?: number): TValidationResult
  validateCoordinates(latitude: number, longitude: number): TValidationResult
}

interface TValidationResult {
  isValid: boolean
  errors: string[]
  sanitizedInput?: any
}
```

## Monitoring and Observability

### Logging Strategy

```typescript
interface TLogger {
  info(message: string, meta?: any): void
  warn(message: string, meta?: any): void
  error(message: string, error: Error, meta?: any): void
  debug(message: string, meta?: any): void
}

// Log Categories:
// - user.action - Действия пользователей
// - search.query - Поисковые запросы
// - api.call - Вызовы внешних API
// - llm.request - Запросы к LLM
// - error.system - Системные ошибки
```

### Metrics Collection

```typescript
interface TMetricsCollector {
  incrementCounter(metric: string, tags?: Record<string, string>): void
  recordDuration(metric: string, duration: number, tags?: Record<string, string>): void
  recordGauge(metric: string, value: number, tags?: Record<string, string>): void
}

// Key Metrics:
// - search.requests.total
// - search.response_time
// - llm.requests.total
// - llm.cost.monthly
// - users.active.daily
// - errors.rate
```

### Health Checks

```typescript
interface THealthChecker {
  checkBotHealth(): Promise<THealthStatus>
  checkDatabaseHealth(): Promise<THealthStatus>
  checkExternalAPIs(): Promise<THealthStatus>
  checkLLMService(): Promise<THealthStatus>
}

interface THealthStatus {
  service: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  latency?: number
  error?: string
  timestamp: Date
}
```

## Deployment Architecture

### Environment Configuration

```typescript
interface TEnvironment {
  NODE_ENV: 'development' | 'production'
  BOT_TOKEN: string
  LLM_API_URL: string
  LLM_API_KEY: string
  DATABASE_URL: string
  REDIS_URL?: string
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error'
  WEBHOOK_URL?: string
  WEBHOOK_SECRET?: string
}
```

### Scaling Strategy

1. **Horizontal Scaling**
   - Stateless bot instances
   - Load balancing через webhook
   - Shared cache layer (Redis)

2. **Resource Management**
   - Memory usage monitoring
   - CPU usage optimization
   - Database connection pooling

## File Structure

```
src/
├── bot/
│   ├── handlers/
│   │   ├── commandHandlers.ts
│   │   ├── messageHandlers.ts
│   │   └── callbackHandlers.ts
│   ├── middleware/
│   │   ├── authMiddleware.ts
│   │   ├── rateLimitMiddleware.ts
│   │   └── errorMiddleware.ts
│   └── botHandler.ts
├── services/
│   ├── user/
│   │   ├── userService.ts
│   │   └── userRepository.ts
│   ├── search/
│   │   ├── searchService.ts
│   │   ├── llmService.ts
│   │   └── queryProcessor.ts
│   ├── data/
│   │   ├── yandexEdaService.ts
│   │   ├── dataCollectionService.ts
│   │   └── cacheService.ts
│   ├── geo/
│   │   └── geolocationService.ts
│   └── message/
│       └── messageFormatter.ts
├── models/
│   ├── user.ts
│   ├── restaurant.ts
│   ├── menuItem.ts
│   └── searchResult.ts
├── utils/
│   ├── validation.ts
│   ├── logger.ts
│   ├── metrics.ts
│   └── healthChecker.ts
├── config/
│   ├── database.ts
│   ├── bot.ts
│   └── environment.ts
└── index.ts
```

## API Integration Details

### Yandex.Eda API Flow

1. **Get Places** - Получение списка ресторанов по координатам
2. **Get Menu** - Получение меню конкретного ресторана
3. **Filter & Transform** - Фильтрация и преобразование данных
4. **Cache Results** - Кэширование для ускорения

### LLM Processing Flow

1. **Query Analysis** - Анализ пользовательского запроса
2. **Structure Extraction** - Извлечение структурированных параметров
3. **Result Enhancement** - Улучшение релевантности результатов
4. **Response Validation** - Проверка качества ответа

## Performance Requirements

### Response Time Targets

- Bot command response: < 1 секунда
- Search query processing: < 5 секунд
- LLM query transformation: < 3 секунды
- Database queries: < 500ms
- Cache hits: < 50ms

### Throughput Requirements

- Concurrent users: до 100
- Requests per second: до 50
- Database connections: до 20
- Memory usage: < 4GB per instance

### Availability Targets

- Uptime: 99.5%
- Error rate: < 1%
- Data freshness: обновление каждый час
