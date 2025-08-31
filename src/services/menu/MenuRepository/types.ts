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
  similarity: number;
  category: string;
  image: string;
  ingredients: string;
  expires_at: string;
}

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
  limit?: number;
  ids?: string[];
  category?: string;
  restaurantNames?: string[];
  minPrice?: number;
  maxPrice?: number;
  city?: string;
  deliveryRadiusKm?: number;
  available?: boolean;
}
