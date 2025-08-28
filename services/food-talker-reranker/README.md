# Food Reranker Service

Сервис для ранжирования блюд по релевантности запросу пользователя с использованием BGE reranker модели.

## Описание

Сервис принимает запрос пользователя и список блюд, затем возвращает отсортированный список по релевантности. Использует HTTP API для работы с GGUF моделью reranker.

### Особенности:
- **HTTP API интеграция** - работает с локальным сервером reranker через HTTP
- **Нормализация scores** - автоматически нормализует scores в диапазон [0, 1] с помощью sigmoid функции
- **Структурированные описания** - создает детальные текстовые представления блюд для лучшего ранжирования
- **Обработка ошибок** - graceful fallback при проблемах с API
- **Асинхронная архитектура** - эффективная обработка запросов

## Запуск

### Docker Compose (рекомендуется)

1. **Создайте файл `.env`** на основе `env.example`:
```bash
cp env.example .env
```

2. **Отредактируйте `.env`** под ваши настройки:
```bash
# Reranker API Configuration
RERANKER_API_URL=http://192.168.1.86:1234/v1/embeddings
RERANKER_MODEL=gpustack/bge-reranker-v2-m3-GGUF
```

3. **Запустите сервис**:
```bash
docker-compose up -d
```

### Docker

```bash
docker build -t food-reranker .
docker run -p 8000:8000 food-reranker
```

### Локально

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

## API

### POST /food-rerank

Ранжирует список блюд по релевантности запросу.

**Запрос:**
```json
{
  "query": "бургер с курицей без помидоров до 300 руб",
  "items": [
    {
      "id": "1",
      "name": "Чикен Бургер",
      "restaurant": {
        "id": "rest1",
        "name": "Burger House",
        "coordinates": {
          "latitude": 55.7558,
          "longitude": 37.6176
        },
        "lastUpdated": "2024-01-01T12:00:00Z"
      },
      "description": "Сочный бургер с куриной котлетой",
      "tags": ["курица", "бургер", "быстро"],
      "price": 250.0,
      "image": "https://example.com/burger.jpg",
      "orderUrl": "https://example.com/order/1",
      "category": "основное"
    }
  ]
}
```

**Ответ:**
```json
{
  "items": [
    {
      "id": "1",
      "name": "Чикен Бургер",
      "restaurant": { ... },
      "description": "Сочный бургер с куриной котлетой",
      "tags": ["курица", "бургер", "быстро"],
      "price": 250.0,
      "image": "https://example.com/burger.jpg",
      "orderUrl": "https://example.com/order/1",
      "category": "основное"
    }
  ],
  "scores": [0.95]
}
```

### GET /health

Проверка здоровья сервиса.

## Категории блюд

- `ACCESSORY` - Аксессуары (салфетки, палочки)
- `DRINK` - Напитки (кола, сок, чай)
- `MAIN` - Основные блюда (бургер, пицца, роллы)
- `SAUCE` - Соусы (кетчуп, майонез)
- `SIDE` - Гарниры (картошка, рис, салаты)

## Конфигурация

- `RERANKER_API_URL` - URL API reranker сервера (по умолчанию: http://192.168.1.86:1234/v1/embeddings)
- `RERANKER_MODEL` - Название модели reranker (по умолчанию: gpustack/bge-reranker-v2-m3-GGUF)

### Доступные модели:

- **gpustack/bge-reranker-v2-m3-GGUF** (по умолчанию) - Многоязычная модель на базе bge-m3
- **BAAI/bge-reranker-v2-gemma** - Многоязычная модель на базе gemma-2b
- **BAAI/bge-reranker-v2-minicpm-layerwise** - Многоязычная модель с layerwise возможностями
- **BAAI/bge-reranker-base** - Легковесная модель для английского и китайского
- **BAAI/bge-reranker-large** - Большая модель для английского и китайского

### Рекомендации по выбору модели:

- **Для многоязычности**: BAAI/bge-reranker-v2-m3, BAAI/bge-reranker-v2-gemma
- **Для русского/английского**: BAAI/bge-reranker-v2-m3, BAAI/bge-reranker-v2-minicpm-layerwise
- **Для эффективности**: BAAI/bge-reranker-v2-m3
- **Для лучшей производительности**: BAAI/bge-reranker-v2-minicpm-layerwise, BAAI/bge-reranker-v2-gemma

## Документация API

После запуска сервиса документация доступна по адресу: http://localhost:8000/docs
