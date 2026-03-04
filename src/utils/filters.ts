import type { Place, LatLng } from "../types.js";

export const coordinatesOfPlaces = (places: Place[]) =>
  places.reduce<LatLng[]>((acc, p) => {
    if (p.location !== undefined) {
      acc.push(p.location);
    }
    return acc;
  }, []);

export const createAppendArrayToSetFunction = <T>(
  set: Set<T>,
  filter: (el: T) => boolean = () => true,
) => (array: T[]) => {
  for (const element of array) {
    if (filter(element)) set.add(element);
  }
};

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

export function limit(x: number, max: number) {
  return Math.min(x, max);
}
