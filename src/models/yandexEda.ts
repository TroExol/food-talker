// Yandex.Eda API Response Types

export interface TYECoordinates {
  latitude: number;
  longitude: number;
}

// Places API Response Types
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

export interface TYEPlace {
  name: TYEText;
  slug: string;
  brand: TYEBrand;
  analytics?: string;
  picture?: TYEPicture;
  left_meta?: TYELeftMeta[];
  features?: TYEFeatures;
  chips?: TYEChip[];
}

export interface TYEPlacesResponse {
  data: {
    places_v2_lists: Array<{
      payload: {
        places: TYEPlace[];
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

export interface TYEMenuItem {
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
  items: TYEMenuItem[];
  gallery: unknown[];
  categories: unknown[];
  informers?: TYEInformer[];
}

export interface TYEMenuResponse {
  payload: {
    categories: TYECategory[];
  };
}

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
}
