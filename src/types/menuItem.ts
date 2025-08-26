import type { TRestaurant } from './restaurant';

export enum EDishCategory {
  ACCESSORY = 'аксессуар', // Аксессуары (салфетки, палочки)
  DRINK = 'напиток', // Напитки (кола, сок, чай)
  MAIN = 'основное', // Основные блюда (бургер, пицца, роллы)
  SAUCE = 'соус', // Соусы (кетчуп, майонез)
  SIDE = 'гарнир', // Гарниры (картошка, рис, салаты)
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
