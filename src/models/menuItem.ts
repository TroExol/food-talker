import type { TRestaurant } from './restaurant';

export interface TMenuItem {
  id: string;
  name: string;
  description: string;
  ingredients: string[];
  price: number; // RUB
  image?: string;
  available: boolean;
  restaurant: TRestaurant;
  orderUrl: string;
}
