import { calculateBarycenter } from "./BFM.js";
import { addPlacesToMap, coordinatesOfPlaces, generateIsWithinCircle } from "./filters.js";
import type { Circle, PlaceMap, MakeCircleId, FetchPlaces, CircleWithID } from "../types.js";

const MIN_RADIUS = 100;
const MAX_ITERATIONS = 10;
const CONVERGENCE_TOLERANCE = 0.1;

interface GetSaturatedCircleAtBarycenterParams {
  callerCircle: Circle;
  globalPlacesMap: PlaceMap;
  saturationLimit: number;
  makeCircleId: MakeCircleId;
  fetchPlaces: FetchPlaces;
  isWithinInitialCircle: ReturnType<typeof generateIsWithinCircle>
}

/**
 * Mode of interior exploration, optimized with binary search.
 * @returns circle with radius of local density scale at the center of mass.
 */
export async function getSaturatedCircleAtBarycenter({
  callerCircle,
  saturationLimit,
  globalPlacesMap,
  makeCircleId,
  fetchPlaces,
  isWithinInitialCircle,
}: GetSaturatedCircleAtBarycenterParams): Promise<CircleWithID> {
  const getBarycenter = () =>
    calculateBarycenter(
      coordinatesOfPlaces(
        [...globalPlacesMap.values()].filter(generateIsWithinCircle(callerCircle))
      )
    );

  let low = MIN_RADIUS;
  let high = callerCircle.radius;

  let smallestSaturated: CircleWithID = {
    id: makeCircleId(),
    radius: high,
    center: getBarycenter(),
  };

  for (let i = 0; i < MAX_ITERATIONS && (high - low) > callerCircle.radius * CONVERGENCE_TOLERANCE; i++) {
    const midRadius = (low + high) / 2;
    const candidate: CircleWithID = {
      id: makeCircleId(),
      radius: midRadius,
      center: getBarycenter(),
    };

    const isWithinCandidate = generateIsWithinCircle(candidate);

    const knownInCandidate = [...globalPlacesMap.values()].filter(isWithinCandidate).length;

    if (knownInCandidate < saturationLimit) {
      const POIs = (await fetchPlaces(candidate)).filter(isWithinInitialCircle);
      addPlacesToMap(POIs, globalPlacesMap);
    }

    const totalInCandidate = [...globalPlacesMap.values()].filter(isWithinCandidate).length;

    if (totalInCandidate >= saturationLimit) {
      high = midRadius;
      smallestSaturated = candidate;
    } else {
      low = midRadius;
    }
  }

  return smallestSaturated;
}
