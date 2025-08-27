import type { TInlineKeyboardMarkup } from '@/types/telegram';
import type { TSearchResultItem } from '@/types/search';

// Форматированные сообщения
export interface TFormattedMessage {
  text: string;
  parseMode?: 'HTML' | 'Markdown';
  replyMarkup?: TInlineKeyboardMarkup;
  photo?: string; // URL изображения
}

// Результаты поиска с пагинацией
export interface TSearchResultsPage {
  items: TSearchResultItem[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

// Настройки пагинации
export interface TPaginationConfig {
  itemsPerPage: number;
}

// Настройки форматирования
export interface TFormattingConfig {
  maxDescriptionLength: number;
  maxIngredientsLength: number;
  showPrice: boolean;
  showRestaurant: boolean;
  showIngredients: boolean;
  showOrderButton: boolean;
  showMoreButton: boolean;
}

// Типы inline кнопок
export enum EInlineButtonType {
  NEXT_PAGE = 'next_page',
  ORDER = 'order',
  PREV_PAGE = 'prev_page',
  RESTAURANT_INFO = 'restaurant_info',
}

// Данные для inline кнопок
export interface TInlineButtonData {
  type: EInlineButtonType;
  itemId?: string;
  restaurantId?: string;
  page?: number;
  orderUrl?: string;
}
