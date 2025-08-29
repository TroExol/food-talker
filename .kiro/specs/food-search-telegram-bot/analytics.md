# Аналитические события для Yandex Metrica

## Общие принципы

Все события отправляются в Yandex Metrica с обязательными параметрами:
- `user_id` - Telegram ID пользователя (если событие происходит вследствии действия пользователя, а не системы)
- `timestamp` - время события
- `session_id` - уникальный идентификатор сессии (если событие происходит вследствии действия пользователя, а не системы)

## 1. Команды бота

### 1.1 `bot_command_executed`
**Описание:** Выполнение команды бота
**Параметры:**
- `command` - название команды ('/address', '/help', '/history', '/search', '/start', '/stats', '/support')
- `user_state` - текущее состояние пользователя ('idle', 'waiting_for_city', 'waiting_for_search_query')
- `user_city` - город пользователя (если установлен)

### 1.2 `bot_command_error`
**Описание:** Ошибка при выполнении команды
**Параметры:**
- `command` - название команды
- `error_type` - тип ошибки ('user_not_found', 'validation_error', 'service_error')
- `error_message` - сообщение об ошибке
- `user_state` - состояние пользователя

## 2. Обработка сообщений

### 2.1 `message_received`
**Описание:** Получение текстового сообщения от пользователя
**Параметры:**
- `message_length` - длина сообщения
- `user_state` - состояние пользователя
- `user_city` - город пользователя
- `message_type` - тип сообщения ('text', 'callback_query')

### 2.2 `search_query_started`
**Описание:** Начало обработки поискового запроса
**Параметры:**
- `id` - id запроса
- `query` - запрос пользователя
- `query_length` - длина запроса
- `user_city` - город пользователя
- `search_options` - опции поиска (JSON с enableLLMEnhancement, enableVectorSearch, maxEnhenceMenu)

### 2.3 `search_query_completed`
**Описание:** Завершение обработки поискового запроса
**Параметры:**
- `id` - id запроса
- `query_length` - длина запроса
- `results_count` - количество найденных результатов
- `processing_time_ms` - время обработки в миллисекундах
- `search_method` - метод поиска ('vector', 'traditional', 'hybrid')
- `has_llm_enhancement` - использовалось ли LLM улучшение (boolean)
- `has_vector_search` - использовался ли векторный поиск (boolean)

### 2.4 `search_query_error`
**Описание:** Ошибка при обработке поискового запроса
**Параметры:**
- `id` - id запроса
- `query_length` - длина запроса
- `error_type` - тип ошибки
- `error_message` - сообщение об ошибке
- `processing_time_ms` - время до ошибки
- `search_method` - метод поиска

### 2.5 `search_limit_exceeded`
**Описание:** Превышение лимита поиска пользователем
**Параметры:**
- `user_subscription` - тип подписки ('basic', 'premium')
- `searches_today` - количество поисков сегодня
- `search_limit` - лимит поисков
- `remaining_searches` - оставшиеся поиски

## 3. Обработка callback'ов

### 3.1 `callback_button_clicked`
**Описание:** Нажатие на inline кнопку
**Параметры:**
- `button_type` - тип кнопки ('city_selection', 'item_selection', 'page_navigation', 'delete_message', 'history_item')
- `button_data` - данные кнопки (callback_data)
- `user_state` - состояние пользователя

### 3.2 `city_selection_completed`
**Описание:** Успешный выбор города
**Параметры:**
- `selected_city` - выбранный город
- `selection_method` - способ выбора ('callback', 'text_input')
- `old_city` - предыдущий город (если был)

### 3.3 `item_selection_completed`
**Описание:** Выбор блюда из результатов поиска
**Параметры:**
- `search_history_id` - ID истории поиска
- `item_id` - ID выбранного блюда
- `has_photo` - есть ли фото у блюда (boolean)

### 3.4 `page_navigation_completed`
**Описание:** Навигация по страницам результатов
**Параметры:**
- `search_history_id` - ID истории поиска
- `page_number` - номер страницы
- `total_pages` - общее количество страниц

### 3.5 `history_item_repeated`
**Описание:** Повторный поиск из истории
**Параметры:**
- `history_item_id` - ID элемента истории
- `original_query` - оригинальный запрос
- `query_length` - длина запроса

## 5. LLM и Embedding запросы

**Примечание:** Детальное логирование LLM и embedding запросов ведется в отдельной таблице БД. В Yandex Metrica отправляются только агрегированные метрики для мониторинга производительности.

### 5.1 `llm_requests_summary`
**Описание:** Сводка по LLM запросам за период
**Параметры:**
- `period_minutes` - период в минутах
- `total_requests` - общее количество запросов
- `successful_requests` - успешных запросов
- `failed_requests` - неудачных запросов
- `average_response_time_ms` - среднее время ответа
- `total_tokens_used` - общее количество токенов

### 5.2 `embedding_requests_summary`
**Описание:** Сводка по embedding запросам за период
**Параметры:**
- `period_minutes` - период в минутах
- `total_requests` - общее количество запросов
- `successful_requests` - успешных запросов
- `failed_requests` - неудачных запросов
- `average_response_time_ms` - среднее время ответа
- `total_vectors_processed` - общее количество векторов

### 5.3 `neural_service_error`
**Описание:** Критическая ошибка в LLM или embedding сервисе
**Параметры:**
- `service_type` - тип сервиса ('llm', 'embedding')
- `error_type` - тип ошибки
- `error_message` - сообщение об ошибке
- `retry_count` - количество попыток повтора

## 6. Ошибки и исключения

### 6.1 `error_occurred`
**Описание:** Любая ошибка в системе
**Параметры:**
- `error_type` - тип ошибки
- `error_message` - сообщение об ошибке
- `stack_trace` - стек вызовов (опционально)
- `component` - компонент системы ('bot', 'search', 'api', 'database')
- `user_action` - действие пользователя

### 6.2 `rate_limit_exceeded`
**Описание:** Превышение лимита запросов
**Параметры:**
- `limit_type` - тип лимита ('per_minute', 'per_hour', 'search_limit')
- `current_requests` - текущее количество запросов
- `limit_value` - значение лимита

### 6.3 `cache_miss`
**Описание:** Промах кэша
**Параметры:**
- `cache_type` - тип кэша ('redis', 'memory')
- `cache_key` - ключ кэша
- `data_type` - тип данных ('menu', 'search_results')

## 7. Пользовательские действия

### 7.1 `user_state_changed`
**Описание:** Изменение состояния пользователя
**Параметры:**
- `old_state` - предыдущее состояние
- `new_state` - новое состояние
- `trigger` - причина изменения ('command', 'callback', 'message')

### 7.2 `search_history_viewed`
**Описание:** Просмотр истории поиска
**Параметры:**
- `history_items_count` - количество элементов в истории
- `viewed_items_count` - количество просмотренных элементов

### 7.3 `user_stats_viewed`
**Описание:** Просмотр статистики пользователя
**Параметры:**
- `user_subscription` - тип подписки
- `searches_today` - поисков сегодня
- `searches_this_month` - поисков за месяц
- `total_searches` - всего поисков

## 8. Технические события

### 8.1 `bot_started`
**Описание:** Запуск бота
**Параметры:**
- `bot_version` - версия бота
- `environment` - окружение ('production', 'development')
- `startup_time_ms` - время запуска

### 8.2 `bot_stopped`
**Описание:** Остановка бота
**Параметры:**
- `uptime_minutes` - время работы
- `total_requests` - общее количество запросов
- `total_errors` - общее количество ошибок

## Реализация

### Отправка событий
```typescript
interface AnalyticsEvent {
  name: string;
  parameters: Record<string, any>;
  timestamp: number;
  user_id?: number;
  session_id?: string;
}

class AnalyticsService {
  trackEvent(event: AnalyticsEvent): void;
  trackError(error: Error, context: Record<string, any>): void;
  trackPerformance(operation: string, duration: number): void;
  trackNeuralSummary(serviceType: 'llm' | 'embedding', summary: NeuralSummary): void;
}
```

### Интеграция с Yandex Metrica
- Использовать официальный SDK для Node.js
- Настроить очередь событий для batch отправки
- Добавить retry логику для надежности
- Реализовать фильтрацию чувствительных данных
- Настроить агрегацию для LLM/embedding метрик

### Приоритеты логирования
1. **Высокий приоритет**: Ошибки, превышение лимитов, критические сбои
2. **Средний приоритет**: Пользовательские действия, команды, поисковые запросы
3. **Низкий приоритет**: Агрегированные метрики производительности, технические события
