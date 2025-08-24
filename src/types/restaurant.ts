export interface TCoordinates {
  latitude: number;
  longitude: number;
}

export interface TRestaurant {
  id: string;
  name: string;
  coordinates: TCoordinates;
  lastUpdated: Date; // ISO string
  additionalInfo?: object;
}
