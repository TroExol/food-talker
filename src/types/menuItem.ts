import type { TRestaurant } from './restaurant';

export enum EDishCategory {
  ACCESSORY = 'accessory', // Аксессуары (салфетки, палочки)
  DRINK = 'drink', // Напитки (кола, сок, чай)
  MAIN = 'main', // Основные блюда (бургер, пицца, роллы)
  SAUCE = 'sauce', // Соусы (кетчуп, майонез)
  SIDE = 'side', // Гарниры (картошка, рис, салаты)
}

export interface TMenuItem {
  id: string;
  name: string;
  description: string;
  ingredients: string[];
  price: number; // RUB
  image: string;
  available: boolean;
  restaurant: TRestaurant;
  orderUrl: string;
  category: EDishCategory;
}
