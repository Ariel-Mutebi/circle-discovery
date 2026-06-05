import type { Circle, CircleWithID, FetchPlaces, MakeCircleId, LatLng, PlaceMap } from "../types.js";
import { latLngToCartesian, cartesianToLatLng, distanceBetween, move, extendLine } from "./cartesian.js";
import { addPlacesToMap, coordinatesOfPlaces, generateIsWithinCircle, getQueryEfficiency } from "./filters.js";

const MAX_ITERATIONS = 10;
const EXPANSION_FACTOR = 1.8;
const NOC_FACTOR = 0.86;

export function respectsNOC(candidateCircle: Circle, existingCircles: Circle[]) {
  for (const existingCircle of existingCircles) {
    const minDist = NOC_FACTOR * (candidateCircle.radius + existingCircle.radius);

    if (distanceBetween(candidateCircle.center, existingCircle.center) < minDist) {
      return false;
    }
  }
  return true;
}

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

export const calculateLocalDensityScale = (
  barycenter: LatLng,
  coordinates: LatLng[],
  saturationLimit: number,
) => {
  const distances = coordinates
    .map(c => distanceBetween(barycenter, c))
    .sort((a, b) => a - b);

  if (distances.length < saturationLimit) {
    return distances.at(-1) ?? 0;
  }

  return distances[19];
};

// Generate 6 sub-circles hexagonally around a barycenter
interface GenerateSubCirclesParams {
  barycenter: LatLng;
  localDensityScale: number;
  sourceId: number;
  getCircleId: MakeCircleId;
};

export function generateSubCircles(params: GenerateSubCirclesParams): CircleWithID[] {
  const { barycenter, localDensityScale, getCircleId, sourceId } = params;
  return [0, 60, 120, 180, 240, 300].map(direction => ({
    center: move(
      barycenter,
      localDensityScale * Math.sqrt(3), // achieves ~13.4% overlap per the paper
      direction,
    ),
    radius: localDensityScale,
    id: getCircleId(),
    sourceId,
  }));
}

// Increase radius back up to higher local density scale and push center outward in exploration.
interface ExpandCircleParams {
  maxRadius: number;
  circle: CircleWithID;
  sourceCenter: LatLng;
  saturationLimit: number;
  fetchPlaces: FetchPlaces;
  getCircleId: MakeCircleId;
  isWithinInitialCircle: ReturnType<typeof generateIsWithinCircle>
}

export async function expandCircle({
  circle,
  maxRadius,
  sourceCenter,
  saturationLimit,
  fetchPlaces,
  getCircleId,
  isWithinInitialCircle,
}: ExpandCircleParams): Promise<CircleWithID> {
  let fullyExpandedCircle = circle;

  for (let i = 0; i < MAX_ITERATIONS && isWithinInitialCircle({ location: fullyExpandedCircle.center }); i++) {
    const initialRadius = fullyExpandedCircle.radius;
    const increasedRadius = Math.min(initialRadius * EXPANSION_FACTOR, maxRadius);
    const deltaRadius = increasedRadius - initialRadius;

    const partiallyRecalibratedCircle: CircleWithID = {
      radius: increasedRadius,
      center: extendLine(sourceCenter, fullyExpandedCircle.center, deltaRadius),
      id: getCircleId(),
    }

    const results = await fetchPlaces(partiallyRecalibratedCircle);
    if (results.length === saturationLimit) break;

    fullyExpandedCircle = partiallyRecalibratedCircle;
  }

  return fullyExpandedCircle;
}
