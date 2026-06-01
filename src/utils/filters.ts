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

/**
 * A maximally efficient query is one which returns only new POIs.
 * 
 * Therefore, query efficiency = new POIs / saturation limit.
 */
export function getQueryEfficiency(
  globalPlacesMap: PlaceMap,
  potentiallyNewPOIs: Place[],
  saturationLimit: number,
) {
  const newPOIs = potentiallyNewPOIs.filter(p => !globalPlacesMap.has(p.id)).length;
  return newPOIs / saturationLimit;
}

/**
 * predicted query efficiency = (saturation limit - POIs already known in candidate circle) / saturation limit
 */
export function predictQueryEfficiency(
  candidateCircle: Circle,
  allKnownPlaces: Place[],
  saturationLimit: number,
) {
  const knownPOIsInCircle = allKnownPlaces.filter(generateIsWithinCircle(candidateCircle));
  return (saturationLimit - knownPOIsInCircle.length) / saturationLimit;
}
