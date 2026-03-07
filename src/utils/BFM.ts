import type { Circle, CircleWithID, FetchPlaces, GetCircleId, LatLng, Place, PlaceMap } from "../types.js";
import { latLngToCartesian, cartesianToLatLng, distanceBetween, move, extendLine } from "./cartesian.js";
import { addPlacesToMap, coordinatesOfPlaces } from "./filters.js";

const MAX_ITERATIONS = 10;
const NOC_FACTOR = 0.86;
const EXPANSION_FACTOR = 1.2;

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
  coordinates.map(c => distanceBetween(barycenter, c)).sort((a, b) => a - b).at(-1) ?? 0;


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

/**
 * Iteratively moves the barycenter toward the densest region of places,
 * contracting the radius so that the true local density scale is found.
 */
interface StabilizeBarycenterParams {
  localPlacesMap: PlaceMap;
  getCircleId: GetCircleId;
  fetchPlaces: FetchPlaces;
  addToGlobalPlacesMap: (p: Place[]) => void;
}

export async function stabilizeBarycenter(params: StabilizeBarycenterParams): Promise<CircleWithID> {
  const { localPlacesMap, getCircleId, fetchPlaces, addToGlobalPlacesMap } = params;

  const getBarycenter = () =>
    calculateBarycenter(coordinatesOfPlaces([...localPlacesMap.values()]));

  let barycenter = getBarycenter();

  const getLocalDensityScale = () =>
    calculateLocalDensityScale(barycenter, coordinatesOfPlaces([...localPlacesMap.values()]));

  const stabilizedCircle: Partial<CircleWithID> = {
    id: getCircleId()
  };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    stabilizedCircle.center = barycenter;
    stabilizedCircle.radius = getLocalDensityScale();

    const results = await fetchPlaces(stabilizedCircle as Circle);
    addToGlobalPlacesMap(results);
    addPlacesToMap(results, localPlacesMap);

    if (results.length < 20) break;
    barycenter = getBarycenter();
  }

  return stabilizedCircle as CircleWithID;
}

// Generate 6 sub-circles hexagonally around a barycenter
interface GenerateSubCirclesParams {
  barycenter: LatLng;
  localDensityScale: number;
  sourceId: number;
  getCircleId: GetCircleId;
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
  fetchPlaces: FetchPlaces;
  getCircleId: GetCircleId;
}

export async function expandCircle(params: ExpandCircleParams): Promise<CircleWithID> {
  const {
    circle,
    maxRadius,
    sourceCenter,
    fetchPlaces,
    getCircleId,
  } = params;
  let fullyExpandedCircle = circle;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const initialRadius = fullyExpandedCircle.radius;
    const increasedRadius = Math.min(initialRadius * EXPANSION_FACTOR, maxRadius);
    const deltaRadius = increasedRadius - initialRadius;

    const partiallyRecalibratedCircle: CircleWithID = {
      radius: increasedRadius,
      center: extendLine(sourceCenter, fullyExpandedCircle.center, deltaRadius),
      id: getCircleId(),
    }

    const results = await fetchPlaces(partiallyRecalibratedCircle);
    if (results.length === 20) break;

    fullyExpandedCircle = partiallyRecalibratedCircle;
  }

  return fullyExpandedCircle;
}
