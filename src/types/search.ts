import type { EDishCategory } from './menuItem';

interface TPriceRange {
  min: number;
  max: number;
}

export interface TStructuredQuery {
  restaurants?: string[];
  tags?: string[];
  priceRange?: TPriceRange;
  categories?: EDishCategory[];
  exclusions?: {
    restaurants?: string[];
    tags?: string[];
    priceRange?: TPriceRange;
    categories?: EDishCategory[];
  };
}

interface TRestaurantInfo {
  id: string;
  name: string;
}

export interface TSearchResultItem {
  id: string;
  name: string;
  restaurant: TRestaurantInfo;
  description: string;
  tags: string[];
  price: number; // RUB
  image?: string;
  orderUrl: string;
}
