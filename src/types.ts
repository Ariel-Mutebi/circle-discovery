import { createIdentity } from "./utils/filters.js";

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Circle {
  center: LatLng;
  radius: number;
};

export interface Place {
  id: string;
  location?: LatLng;
}

export interface CircleWithID extends Circle {
  id: number;
  sourceId?: number;
}

export type FetchPlaces = (circle: Circle) => Promise<Place[]>;
export type GetCircleId = ReturnType<typeof createIdentity>;
export type PlaceMap = Map<string, Place>;
