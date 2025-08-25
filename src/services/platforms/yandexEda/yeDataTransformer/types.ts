import type { TCoordinates } from '@/types/restaurant';
import type { TMenuItem } from '@/types/menuItem';

import type {
  TYEMenuItemFromServer,
  TYERestaurant,
  TYERestaurantFromServer,
} from '../yeApiService/types';

export interface TYEDataTransformer {
  transformRestaurant: (restaurant: TYERestaurantFromServer, coordinates: TCoordinates) => TYERestaurant;
  transformMenuItem: (menuItem: TYEMenuItemFromServer, restaurant: TYERestaurant) => Promise<TMenuItem>;
  transformRestaurants: (restaurant: TYERestaurantFromServer[], coordinates: TCoordinates) => TYERestaurant[];
  transformMenu: (menuItems: TYEMenuItemFromServer[], restaurant: TYERestaurant) => Promise<TMenuItem[]>;
}
