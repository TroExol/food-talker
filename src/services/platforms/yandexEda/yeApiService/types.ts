// Yandex.Eda API Response Types

import type { TCoordinates, TRestaurant } from '@/types/restaurant';
import type { TMenuItem } from '@/types/menuItem';
import type { EAvailableCities } from '@/config/bot/types';

export interface TYECoordinates {
  latitude: number;
  longitude: number;
}

// Restaurants API Response Types
export interface TYEColor {
  light: string;
  dark: string;
}

export interface TYEText {
  value: string;
  color: TYEColor;
}

export interface TYEIcon {
  color?: TYEColor;
  url: string;
}

export interface TYEPicture {
  image: string;
  uri?: string;
  ratio?: number;
  scale?: string;
}

export interface TYEBrand {
  slug: string;
  name: string;
  business: string;
}

export interface TYEChip {
  type: string;
  payload: {
    background: TYEColor;
    text: TYEText;
  };
}

export interface TYEFeatures {
  rating?: {
    text: TYEText;
    icon: TYEIcon;
  };
  user_collections?: {
    in_collections: boolean;
  };
}

export interface TYELeftMeta {
  id: string;
  type: string;
  payload: {
    icon?: {
      type: string;
      icon: TYEIcon;
    };
    text: TYEText;
    type: string;
  };
}

export interface TYERestaurantFromServer {
  name: TYEText;
  slug: string;
  brand: TYEBrand;
  analytics?: string;
  picture?: TYEPicture;
  left_meta?: TYELeftMeta[];
  features?: TYEFeatures;
  chips?: TYEChip[];
}

export interface TYERestaurantsFromServer {
  data: {
    places_v2_lists: Array<{
      payload: {
        places: TYERestaurantFromServer[];
      };
    }>;
  };
}

// Menu API Response Types
export interface TYENutrient {
  name: string;
  value: string;
  unit: string;
}

export interface TYENutrientsDetailed {
  calories: TYENutrient;
  proteins: TYENutrient;
  fats: TYENutrient;
  carbohydrates: TYENutrient;
  description: {
    value: string;
  };
}

export interface TYEMeasure {
  value: string;
  measure_unit: string;
}

export interface TYEDescription {
  title: string;
  text: string;
  expanded_text: string;
  collapsed_text: string;
  collapsed_text_lines_count: number;
}

export interface TYEMenuItemFromServer {
  id: number;
  name: string;
  description: string;
  descriptions?: TYEDescription[];
  available: boolean;
  inStock: boolean | null;
  price: number;
  decimalPrice: string;
  promoTypes: string[];
  optionsGroups: unknown[];
  picture?: TYEPicture;
  weight?: string;
  adult: boolean;
  shippingType: string;
  measure?: TYEMeasure;
  nutrients_detailed?: TYENutrientsDetailed;
  publicId: string;
}

export interface TYEInformer {
  id: string;
  text: TYEText;
  icon?: {
    light: string;
    dark: string;
  };
  background?: {
    light: {
      red: number;
      green: number;
      blue: number;
    };
    dark: {
      red: number;
      green: number;
      blue: number;
    };
  };
  action?: {
    type: string;
    payload: {
      title: string;
      text: string;
      type: string;
    };
  };
}

export interface TYECategory {
  id: number;
  name: string;
  available: boolean;
  items: TYEMenuItemFromServer[];
  gallery: unknown[];
  categories: unknown[];
  informers?: TYEInformer[];
}

export interface TYEMenuFromServer {
  payload: {
    categories: TYECategory[];
  };
}

export type TYERestaurant = {
  additionalInfo: {
    brandSlug: string;
  };
} & TRestaurant;

// Rate Limiting Types
export interface TYERateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  windowSizeMs: number; // За сколько миллисекунд считается количество запросов
}

export interface TYERateLimitState {
  requests: number[];
  lastReset: number;
}

// API Client Configuration
export interface TYEApiConfig {
  baseUrl: string;
  headers: Record<string, string>;
  rateLimits: TYERateLimitConfig;
  timeout: number;
  retries: number;
  delayBetweenRequestsMs: number; // Задержка между запросами в миллисекундах
}

export interface TYEService {
  requestRestaurants: (coordinates: TCoordinates) => Promise<TYERestaurantFromServer[]>;
  requestRestaurantMenu: (
    id: string,
    coordinates: TCoordinates,
    brandSlug: string,
  ) => Promise<TYEMenuItemFromServer[]>;
  checkRateLimit: () => boolean;

  // Cached
  getRestaurants: (city: EAvailableCities) => Promise<TYERestaurant[]>;
  getRestaurantMenu: (
    id: string,
    city: EAvailableCities,
    brandSlug: string,
  ) => Promise<TMenuItem[]>;
  clearCache: (pattern?: string) => Promise<void>;
  getCacheStats: () => Promise<{ restaurants: number; menus: number }>;
}
