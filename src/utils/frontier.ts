import { extendLine, move } from "./cartesian.js";
import { generateIsWithinCircle } from "./filters.js";
import type { LatLng, MakeCircleId, PlaceMap, CircleWithID, Circle, FetchPlaces } from "../types.js";

const MAX_KNOWN_FRACTION = 0.75;
const EXPANSION_FACTOR = 2.0;

interface TessellateFromParams {
  barycenter: LatLng;
  localDensityScale: number;
  sourceId: number;
  makeCircleId: MakeCircleId;
  globalPlacesMap: PlaceMap;
  saturationLimit: number;
};

export function tesselateFrom({
  sourceId,
  makeCircleId,
  barycenter,
  localDensityScale,
  globalPlacesMap,
  saturationLimit,
}: TessellateFromParams): CircleWithID[] {
  return [0, 60, 120, 180, 240, 300]
    .map(direction => {
      const center = move(barycenter, localDensityScale * Math.sqrt(3), direction);
      const candidate: Circle = {
        center,
        radius: localDensityScale,
      };
      const known = [...globalPlacesMap.values()].filter(generateIsWithinCircle(candidate)).length;
      return { center, known };
    })
    .filter(({ known }) => known < saturationLimit * MAX_KNOWN_FRACTION)
    .map(({ center }) => ({
      center,
      radius: localDensityScale,
      id: makeCircleId(),
      sourceId,
    }));
}

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

  while (isWithinInitialCircle({ location: fullyExpandedCircle.center })) {
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

