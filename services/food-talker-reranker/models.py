from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, field_serializer
from datetime import datetime


class EDishCategory(str, Enum):
    ACCESSORY = "аксессуар"
    DRINK = "напиток"
    MAIN = "основное"
    SAUCE = "соус"
    SIDE = "гарнир"


class TCoordinates(BaseModel):
    latitude: float
    longitude: float


class TRestaurant(BaseModel):
    id: str
    name: str
    coordinates: TCoordinates


class TSearchResultItem(BaseModel):
    id: str
    name: str
    restaurant: TRestaurant
    description: str
    tags: List[str]
    price: float  # RUB
    image: str
    orderUrl: str
    category: EDishCategory


class TFoodRerankRequest(BaseModel):
    query: str
    items: List[TSearchResultItem]


class TFoodRerankResponse(BaseModel):
    items: List[TSearchResultItem]
    scores: List[float]
