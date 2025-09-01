import type { TSearchResultItem } from '@/types/search';
import type { TMenuItem } from '@/types/menuItem';

export interface TMenuItemEntity {
  id: string;
  name: string;
  description: string;
  price: number;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_latitude: number;
  restaurant_longitude: number;
  available: boolean;
  order_url: string;
  category: string;
  image: string;
  ingredients: string;
  expires_at: string;
}

export type TMenuItemEntityWithSimilarity = {
  similarity: number;
} & TMenuItemEntity;

export type TMenuItemEntityWithEmbedding = {
  embedding: string;
} & TMenuItemEntity;

export type TVectorMenuItem = {
  embedding: number[];
} & TMenuItem;

export type TVectorSearchResultItem = {
  similarity: number;
} & TSearchResultItem;

export interface TVectorMenuSearchOptions {
  limit?: number;
  category?: string;
  restaurantNames?: string[];
  minPrice?: number;
  maxPrice?: number;
  minSimilarity?: number;
  city?: string;
  deliveryRadiusKm?: number;
  available?: boolean;
}

export interface TMenuSearchOptions {
  limit?: number | null;
  ids?: string[] | null;
  category?: string | null;
  restaurantNames?: string[] | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  city?: string | null;
  deliveryRadiusKm?: number | null;
  available?: boolean | null;
  showExpired?: boolean | null;
}
