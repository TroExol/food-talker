import os
import re
from typing import List, Tuple
from models import TSearchResultItem
from FlagEmbedding import FlagReranker


class TRerankerService:
    def __init__(self, model_name: str = None):
        self.model_name = model_name or os.getenv("RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")
        self.reranker = None
        self._initialize_model()
    
    def _initialize_model(self):
        """Инициализирует локальную модель reranker"""
        try:
            print(f"🔄 Загружаем модель: {self.model_name}")
            import sys
            sys.stdout.flush()  # Принудительно выводим в консоль
            import torch
            print(f"GPU count: {torch.cuda.device_count()}")
            for i in range(torch.cuda.device_count()):
                print(f"GPU {i}: {torch.cuda.get_device_name(i)}")

            self.reranker = FlagReranker(self.model_name, use_fp16=False)
            print("✅ Модель успешно загружена")
            sys.stdout.flush()
        except Exception as e:
            print(f"❌ Ошибка загрузки модели: {e}")
            import sys
            sys.stdout.flush()
            self.reranker = None

    def _create_document_text(self, item: TSearchResultItem) -> str:
        """Создает текстовое представление блюда для ранжирования"""
        tags_text = ", ".join(item.tags) if item.tags else ""
        # Формируем структурированное описание блюда
        return f"{item.name} - {item.description}. Категория: {item.category.value}. Теги: {tags_text}. Ресторан: {item.restaurant.name}. Цена: {item.price} руб."

    def _compute_scores(self, query: str, documents: List[str]) -> List[float]:
        """Вычисляет scores используя локальную модель"""
        try:
            if not self.reranker:
                print("❌ Модель не загружена, возвращаем fallback scores")
                return [0.5] * len(documents)
            
            # Формируем пары запрос-документ для ранжирования
            pairs = [[query, doc] for doc in documents]
            
            print(f"Вычисляем scores для {len(pairs)} пар")
            scores = self.reranker.compute_score(pairs)
            
            # Нормализуем scores в диапазон [0, 1]
            if scores:
                min_score = min(scores)
                max_score = max(scores)
                if max_score > min_score:
                    scores = [(s - min_score) / (max_score - min_score) for s in scores]
                else:
                    scores = [0.5] * len(scores)
            
            print(f"Получены scores: {scores}")
            return scores
            
        except Exception as e:
            print(f"❌ Ошибка вычисления scores: {e}")
            return [0.5] * len(documents)

    async def rerank_items(self, query: str, items: List[TSearchResultItem]) -> Tuple[List[TSearchResultItem], List[float]]:
        """Ранжирует список блюд по релевантности запросу"""
        if not items:
            return [], []
        
        # Создаем текстовые представления блюд
        documents = [self._create_document_text(item) for item in items]
        
        # Получаем scores от reranker
        scores = self._compute_scores(query, documents)
        
        # Сортируем items по scores (по убыванию)
        items_with_scores = list(zip(items, scores))
        items_with_scores.sort(key=lambda x: x[1], reverse=True)
        
        # Разделяем отсортированные items и scores
        sorted_items = [item for item, _ in items_with_scores]
        sorted_scores = [score for _, score in items_with_scores]
        
        return sorted_items, sorted_scores

    def close(self):
        """Очищает ресурсы модели"""
        if self.reranker:
            del self.reranker
            self.reranker = None
