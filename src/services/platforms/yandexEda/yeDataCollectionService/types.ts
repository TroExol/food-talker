import type { EAvailableCities } from '@/config/bot/types';

export interface TYEDataCollectionService {
  startCollection(): Promise<void>;
  stopCollection(): void;
  updateRestaurants(city?: EAvailableCities): Promise<void>;
  updateRestaurantMenu(restaurantId: string, city: EAvailableCities): Promise<void>;
  scheduleUpdates(): void;
  getCollectionStats(): Promise<TCollectionStats>;
}

export interface TCollectionStats {
  lastUpdateTime: Date | null;
  totalRestaurants: number;
  totalMenuItems: number;
  updateFrequency: string;
  isRunning: boolean;
  errors: number;
}
