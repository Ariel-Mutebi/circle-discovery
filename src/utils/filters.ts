import type { Place, LatLng } from "../types.js";

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

export function limit(x: number, max: number) {
  return Math.min(x, max);
}
