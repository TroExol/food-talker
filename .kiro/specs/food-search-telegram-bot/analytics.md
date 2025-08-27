# Аналитические события для Yandex Metrica

## Общие принципы

Все события отправляются в Yandex Metrica с обязательными параметрами:
- `user_id` - Telegram ID пользователя
- `timestamp` - время события
- `session_id` - уникальный идентификатор сессии

## 1. Команды бота

### 1.1 `bot_command_executed`
**Описание:** Выполнение команды бота
**Параметры:**
- `command` - название команды (`/start`, `/help`, `/address`, `/history`)
- `user_state` - текущее состояние пользователя
- `user_city` - город пользователя
- `is_new_user` - новый ли пользователь (boolean)

### 1.2 `bot_command_error`
**Описание:** Ошибка при выполнении команды
**Параметры:**
- `command` - название команды
- `error_type` - тип ошибки
- `error_message` - сообщение об ошибке
- `user_state` - состояние пользователя

## 2. Обработка сообщений

### 2.1 `message_received`
**Описание:** Получение текстового сообщения от пользователя
**Параметры:**
- `message_length` - длина сообщения
- `user_state` - состояние пользователя
- `user_city` - город пользователя
- `has_attachments` - есть ли вложения (boolean)

### 2.2 `search_query_started`
**Описание:** Начало обработки поискового запроса
**Параметры:**
- `query` - запрос
- `query_length` - длина запроса
- `user_city` - город пользователя
- `search_options` - опции поиска (JSON)

### 2.3 `search_query_completed`
**Описание:** Завершение обработки поискового запроса
**Параметры:**
- `query_length` - длина запроса
- `results_count` - количество найденных результатов
- `results_names` - названия результатов 
- `processing_time_ms` - время обработки в миллисекундах
- `search_method` - метод поиска (`vector`, `traditional`, `hybrid`)
- `has_llm_enhancement` - использовалось ли LLM улучшение

### 2.4 `search_query_error`
**Описание:** Ошибка при обработке поискового запроса
**Параметры:**
- `error_type` - тип ошибки
- `error_message` - сообщение об ошибке
- `processing_time_ms` - время до ошибки
- `search_method` - метод поиска

## 3. Использование токенов

### 3.1 `llm_request_started`
**Описание:** Начало запроса к LLM
**Параметры:**
- `request_type` - тип запроса (`structure_query`, `enhance_results`, `other`)
- `model` - модель LLM
- `prompt_length` - длина промпта

### 3.2 `llm_request_completed`
**Описание:** Завершение запроса к LLM
**Параметры:**
- `request_type` - тип запроса
- `model` - модель LLM
- `total_tokens` - общее количество токенов
- `prompt_tokens` - токены промпта
- `completion_tokens` - токены ответа
- `processing_time_ms` - время обработки
- `response_length` - длина ответа
- `response` - ответ

### 3.3 `llm_request_error`
**Описание:** Ошибка при запросе к LLM
**Параметры:**
- `request_type` - тип запроса
- `model` - модель LLM
- `error_type` - тип ошибки
- `error_message` - сообщение об ошибке
- `attempt_number` - номер попытки
- `processing_time_ms` - время до ошибки

### 3.4 `tokens_consumed`
**Описание:** Общее потребление токенов за сессию
**Параметры:**
- `session_total_tokens` - общее количество токенов за сессию
- `session_prompt_tokens` - токены промптов за сессию
- `session_completion_tokens` - токены ответов за сессию
- `session_duration_minutes` - длительность сессии в минутах

## 4. Время обработки

### 4.1 `api_request_started`
**Описание:** Начало запроса к внешнему API
**Параметры:**
- `api_name` - название API (`yandex_eda`, `embedding_service`)
- `endpoint` - эндпоинт
- `request_type` - тип запроса

### 4.2 `api_request_completed`
**Описание:** Завершение запроса к внешнему API
**Параметры:**
- `api_name` - название API
- `endpoint` - эндпоинт
- `processing_time_ms` - время обработки
- `response_size` - размер ответа
- `status_code` - HTTP статус код

### 4.3 `api_request_error`
**Описание:** Ошибка при запросе к внешнему API
**Параметры:**
- `api_name` - название API
- `endpoint` - эндпоинт
- `error_type` - тип ошибки
- `status_code` - HTTP статус код
- `processing_time_ms` - время до ошибки

## 5. Ошибки и исключения

### 5.1 `error_occurred`
**Описание:** Любая ошибка в системе
**Параметры:**
- `error_type` - тип ошибки
- `error_message` - сообщение об ошибке
- `stack_trace` - стек вызовов (опционально)
- `component` - компонент системы
- `user_action` - действие пользователя

### 5.2 `rate_limit_exceeded`
**Описание:** Превышение лимита запросов
**Параметры:**
- `limit_type` - тип лимита (`per_minute`, `per_hour`)
- `current_requests` - текущее количество запросов
- `limit_value` - значение лимита

### 5.3 `cache_miss`
**Описание:** Промах кэша
**Параметры:**
- `cache_type` - тип кэша (`redis`, `memory`)
- `cache_key` - ключ кэша
- `data_type` - тип данных

## 6. Пользовательские действия

### 6.1 `callback_button_clicked`
**Описание:** Нажатие на inline кнопку
**Параметры:**
- `button_type` - тип кнопки (`city_selection`, `item_selection`, `page_navigation`, `order`)
- `button_data` - данные кнопки
- `user_state` - состояние пользователя

### 6.2 `city_changed`
**Описание:** Изменение города пользователя
**Параметры:**
- `old_city` - предыдущий город
- `new_city` - новый город
- `change_method` - способ изменения (`command`, `callback`)

### 6.3 `search_history_viewed`
**Описание:** Просмотр истории поиска
**Параметры:**
- `history_items_count` - количество элементов в истории
- `viewed_items_count` - количество просмотренных элементов

### 6.4 `restaurant_selected`
**Описание:** Выбор ресторана
**Параметры:**
- `restaurant_id` - ID ресторана
- `restaurant_name` - название ресторана
- `selection_method` - способ выбора (`search_result`, `history`)

## 7. Производительность

### 7.1 `memory_usage`
**Описание:** Использование памяти
**Параметры:**
- `memory_usage_mb` - использование памяти в МБ
- `memory_limit_mb` - лимит памяти в МБ
- `heap_used_mb` - использованная куча в МБ

### 7.2 `cache_performance`
**Описание:** Производительность кэша
**Параметры:**
- `cache_hit_rate` - процент попаданий в кэш
- `cache_size` - размер кэша
- `cache_evictions` - количество вытеснений

## 8. Бизнес-метрики

### 8.1 `search_conversion`
**Описание:** Конверсия поиска в заказ
**Параметры:**
- `search_query` - поисковый запрос
- `results_count` - количество результатов
- `order_clicked` - был ли клик на заказ (boolean)
- `conversion_time_ms` - время до конверсии

### 8.2 `user_engagement`
**Описание:** Вовлеченность пользователя
**Параметры:**
- `session_duration_minutes` - длительность сессии
- `messages_count` - количество сообщений
- `searches_count` - количество поисков
- `commands_count` - количество команд

## 9. Технические события

### 9.1 `bot_started`
**Описание:** Запуск бота
**Параметры:**
- `bot_version` - версия бота
- `environment` - окружение (`production`, `development`)
- `startup_time_ms` - время запуска

### 9.2 `bot_stopped`
**Описание:** Остановка бота
**Параметры:**
- `uptime_minutes` - время работы
- `total_requests` - общее количество запросов
- `total_errors` - общее количество ошибок

### 9.3 `health_check`
**Описание:** Проверка здоровья системы
**Параметры:**
- `database_status` - статус базы данных
- `cache_status` - статус кэша
- `llm_status` - статус LLM
- `api_status` - статус внешних API
- `response_time_ms` - время ответа

## Реализация

### Отправка событий
```typescript
interface AnalyticsEvent {
  name: string;
  parameters: Record<string, any>;
  timestamp: number;
  user_id: number;
  session_id: string;
}

class AnalyticsService {
  trackEvent(event: AnalyticsEvent): void;
  trackError(error: Error, context: Record<string, any>): void;
  trackPerformance(operation: string, duration: number): void;
}
```

### Интеграция с Yandex Metrica
- Использовать официальный SDK для Node.js
- Настроить очередь событий для batch отправки
- Добавить retry логику для надежности
- Реализовать фильтрацию чувствительных данных
