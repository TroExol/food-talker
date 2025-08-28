import asyncio
import httpx
from datetime import datetime
from models import TFoodRerankRequest, TSearchResultItem, TRestaurant, TCoordinates, EDishCategory


async def test_rerank_service():
    """Упрощенный тест без datetime"""
    
    # Создаем тестовые данные
    test_items = [
        TSearchResultItem(
            id="1",
            name="Чикен Бургер",
            restaurant=TRestaurant(
                id="rest1",
                name="Burger House",
                coordinates=TCoordinates(latitude=55.7558, longitude=37.6176),
                lastUpdated=datetime.fromisoformat("2024-01-01T12:00:00+00:00")
            ),
            description="Сочный бургер с куриной котлетой, свежими овощами и соусом",
            tags=["курица", "бургер", "быстро", "свежий"],
            price=250.0,
            image="https://example.com/burger1.jpg",
            orderUrl="https://example.com/order/1",
            category=EDishCategory.MAIN
        ),
        TSearchResultItem(
            id="2",
            name="Биг Мак",
            restaurant=TRestaurant(
                id="rest2",
                name="McDonald's",
                coordinates=TCoordinates(latitude=55.7558, longitude=37.6176),
                lastUpdated=datetime.fromisoformat("2024-01-01T12:00:00+00:00")
            ),
            description="Классический бургер с говяжьей котлетой, салатом и сыром",
            tags=["говядина", "бургер", "классика"],
            price=350.0,
            image="https://example.com/burger2.jpg",
            orderUrl="https://example.com/order/2",
            category=EDishCategory.MAIN
        ),
        TSearchResultItem(
            id="3",
            name="Кола",
            restaurant=TRestaurant(
                id="rest1",
                name="Burger House",
                coordinates=TCoordinates(latitude=55.7558, longitude=37.6176),
                lastUpdated=datetime.fromisoformat("2024-01-01T12:00:00+00:00")
            ),
            description="Освежающий газированный напиток",
            tags=["напиток", "газировка", "освежающий"],
            price=100.0,
            image="https://example.com/cola.jpg",
            orderUrl="https://example.com/order/3",
            category=EDishCategory.DRINK
        )
    ]
    
    request = TFoodRerankRequest(
        query="бургер с курицей до 300 руб",
        items=test_items
    )
    
    # Отправляем запрос к сервису
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                "http://localhost:8000/food-rerank",
                json=request.model_dump(),
                timeout=30.0
            )
            
            if response.status_code == 200:
                result = response.json()
                print("✅ Успешный ответ:")
                print(f"Количество блюд: {len(result['items'])}")
                print(f"Scores: {result['scores']}")
                
                for i, (item, score) in enumerate(zip(result['items'], result['scores'])):
                    print(f"{i+1}. {item['name']} - {item['price']} руб (score: {score:.3f})")
            else:
                print(f"❌ Ошибка: {response.status_code}")
                print(response.text)
                
        except Exception as e:
            print(f"❌ Ошибка запроса: {e}")


if __name__ == "__main__":
    asyncio.run(test_rerank_service())
