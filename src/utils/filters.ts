import type { Place, LatLng, PlaceMap, Circle } from "../types.js";
import { distanceBetween } from "./cartesian.js";

export const generateIsWithinCircle = (circle: Circle) => (place: Partial<Place>) =>
  place.location ? distanceBetween(circle.center, place.location) < circle.radius : false;

export const coordinatesOfPlaces = (places: Place[]) =>
  places.reduce<LatLng[]>((acc, p) => {
    if (p.location !== undefined) {
      acc.push(p.location);
    }
    return acc;
  }, []);

export function addPlacesToMap(
  places: Place[],
  map: PlaceMap,
  locationFilter: (place: Place) => boolean = () => true,
) {
  for (const place of places) {
    if (place.id && locationFilter(place)) {
      map.set(place.id, place);
    }
  }
}

/**
 * Inspired by SQL identity columns
 */
export function createIdentity() {
  let current = 1;

  return function nextId() {
    return current++;
  };
}
