import { calculateBarycenter } from "./BFM.js";
import { addPlacesToMap, coordinatesOfPlaces, generateIsWithinCircle } from "./filters.js";
import type { Circle, PlaceMap, MakeCircleId, FetchPlaces, CircleWithID } from "../types.js";

const MIN_RADIUS = 100;
const MAX_ITERATIONS = 10;

interface GetSaturatedCircleAtBarycenterParams {
  callerCircle: Circle;
  globalPlacesMap: PlaceMap;
  saturationLimit: number;
  makeCircleId: MakeCircleId;
  fetchPlaces: FetchPlaces;
  isWithinInitialCircle: ReturnType<typeof generateIsWithinCircle>
}

/**
 * Mode of interior exploration.
 * @returns saturated circle at the center of mass.
 * 
 * Optimized with binary search. The original implementation used
 * linear search + a contraction factor of 0.9 (distance is a continuous
 * variable, so it is necessary to turn a continuous range into a set of
 * discrete points for the search). This uses binary search to find the
 * barycenter and an accurate local density scale (works well with the
 * continuous nature of the search space, approximately O(log n) api calls).
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

  let iteration = 0;
  let minRadius = MIN_RADIUS;
  let maxRadius = callerCircle.radius;

  while (minRadius < maxRadius || iteration < MAX_ITERATIONS ) {
    const midRadius = (maxRadius - minRadius) / 2;

    const subCircle: CircleWithID = {
      id: makeCircleId(),
      radius: midRadius,
      center: getBarycenter(),
    };

    // Filter isn't so necessary as this is interior exploration, but in case.
    const POIs = (await fetchPlaces(subCircle)).filter(isWithinInitialCircle);
    addPlacesToMap(POIs, globalPlacesMap);

    // +- 10% of saturation limit to prevent over-refinement
    if (POIs.length < saturationLimit - saturationLimit * 0.1) {
      minRadius = midRadius;
    } else if (POIs.length > saturationLimit + saturationLimit * 0.1) {
      maxRadius = midRadius;
    } else {
      return subCircle;
    }

    iteration++;
  }

  /**
   * Unreachable: it is extremely unlikely for minRadius to equal maxRadius.
  */
  return {
    id: makeCircleId(),
    radius: minRadius,
    center: getBarycenter(),
  };
}
