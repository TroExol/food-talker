interface TPriceRange {
  min: number;
  max: number;
}

export interface TStructuredQuery {
  restaurants?: string[];
  tags?: string[];
  priceRange?: TPriceRange;
  exclusions?: {
    restaurants?: string[];
    tags?: string[];
    priceRange?: TPriceRange;
  };
}

export interface TRestaurantInfo {
  id: string;
  name: string;
}

export interface TSearchResult {
  id: string;
  name: string;
  restaurant: TRestaurantInfo;
  description: string;
  tags: string[];
  price: number; // RUB
  image?: string;
  orderUrl: string;
}
