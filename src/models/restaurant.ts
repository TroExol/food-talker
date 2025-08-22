import type { EAvailableCities } from '@/config/bot';

export interface TCoordinates {
  latitude: number;
  longitude: number;
}

export interface TWorkingHours {
  open: string; // HH:MM
  close: string; // HH:MM
  isOpen: boolean;
}

export interface TRestaurant {
  id: string;
  name: string;
  coordinates: TCoordinates;
  workingHours: TWorkingHours;
  minimumOrderAmount?: number; // RUB
  lastUpdated: Date; // ISO string
  additionalInfo?: object;
}

export interface TRestaurantCacheEntity {
  id: string;
  name: string;
  data: string; // JSON string
  city: EAvailableCities;
  last_updated: string; // ISO string
  is_active: number;
}
