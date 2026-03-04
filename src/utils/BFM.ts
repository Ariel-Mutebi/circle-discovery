import type { Circle, LatLng } from "../types.js";
import { latLngToCartesian, cartesianToLatLng, distanceBetween } from "./cartesian.js";

export function calculateBarycenter(points: LatLng[]): LatLng {
  if (points.length === 0) {
    throw new Error("Cannot compute barycenter of empty array");
  }

  let x = 0;
  let y = 0;
  let z = 0;

  for (const p of points) {
    const c = latLngToCartesian(p);
    x += c.x;
    y += c.y;
    z += c.z;
  }

  // Mean vector
  x /= points.length;
  y /= points.length;
  z /= points.length;

  // Normalize back onto unit sphere
  const length = Math.sqrt(x * x + y * y + z * z);

  x /= length;
  y /= length;
  z /= length;

  return cartesianToLatLng({ x, y, z });
}

export const calculateLocalDensityScale = (barycenter: LatLng, coordinates: LatLng[]) =>
  coordinates.map(c => distanceBetween(barycenter, c)).sort((a, b) => a - b)[-1];

const NOC_FACTOR = 0.86;

export function respectsNOC(candidateCircle: Circle, existingCircles: Circle[]) {
  for (const existingCircle of existingCircles) {
    const minDist = NOC_FACTOR * (candidateCircle.radius + existingCircle.radius);

    if (
      distanceBetween(candidateCircle.center, existingCircle.center) < minDist
    ) {
      return false;
    }
  }
  return true;
}
