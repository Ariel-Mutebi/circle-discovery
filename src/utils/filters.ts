import type { Place, LatLng, PlaceMap } from "../types.js";
import { distanceBetween } from "./cartesian.js";

export const coordinatesOfPlaces = (places: Place[]) =>
  places.reduce<LatLng[]>((acc, p) => {
    if (p.location !== undefined) {
      acc.push(p.location);
    }
    return acc;
  }, []);

// inspired by SQL identity columns
export function createIdentity() {
  let current = 1;

  return function nextId() {
    return current++;
  };
}

export function clamp(min: number, clamped: number, max: number) {
  return Math.min(Math.max(clamped, min), max);
}

export function makeIsWithinInitialCircle(initialCenter: LatLng, initialRadius: number) {
  return (point: LatLng) => distanceBetween(initialCenter, point) < initialRadius;
}

export function addPlacesToMap(
  places: Place[],
  map: PlaceMap,
  locationFilter: (loc: LatLng) => boolean = () => true,
) {
  for (const place of places) {
    if (place.id && place.location && locationFilter(place.location)) {
      map.set(place.id, place);
    }
  }
}
