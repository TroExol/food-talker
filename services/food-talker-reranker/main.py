from fastapi import FastAPI, HTTPException, Request
from contextlib import asynccontextmanager
from models import TFoodRerankRequest, TFoodRerankResponse
from reranker_service import TRerankerService
import json


# Глобальная переменная для сервиса
reranker_service: TRerankerService = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Управление жизненным циклом приложения"""
    global reranker_service
    # Инициализация сервиса при запуске
    reranker_service = TRerankerService()
    yield
    # Очистка при завершении
    if reranker_service:
        reranker_service.close()


app = FastAPI(
    title="Food Reranker Service",
    description="Сервис для ранжирования блюд по релевантности запросу пользователя",
    version="1.0.0",
    lifespan=lifespan
)


@app.post("/food-rerank", response_model=TFoodRerankResponse)
async def rerank_food(request: Request, food_request: TFoodRerankRequest) -> TFoodRerankResponse:
    """
    Ранжирует список блюд по релевантности запросу пользователя
    
    - **query**: Запрос пользователя (например, "бургер с курицей без помидоров до 300 руб")
    - **items**: Список блюд для ранжирования
    """
    try:
        # Логируем входящий запрос для отладки
        body = await request.body()
        print(f"📥 Входящий запрос: {body.decode()}")
        
        if not food_request.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        
        if not food_request.items:
            return TFoodRerankResponse(items=[], scores=[])
        
        print(f"✅ Запрос валиден: query='{food_request.query}', items={len(food_request.items)}")
        
        # Ранжируем блюда
        sorted_items, scores = await reranker_service.rerank_items(
            food_request.query, 
            food_request.items
        )
        
        return TFoodRerankResponse(items=sorted_items, scores=scores)
        
    except Exception as e:
        print(f"❌ Ошибка обработки запроса: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.get("/health")
async def health_check():
    """Проверка здоровья сервиса"""
    return {"status": "healthy", "service": "food-reranker"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
