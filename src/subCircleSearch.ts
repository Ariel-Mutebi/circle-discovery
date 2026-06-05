import { respectsNOC } from "./utils/BFM.js";
import { createIdentity, addPlacesToMap, generateIsWithinCircle } from "./utils/filters.js";
import { getSaturatedCircleAtBarycenter } from "./utils/interior.js";
import { tesselateFrom, expandCircle } from "./utils/frontier.js";
import type { Place, LatLng, CircleWithID, FetchPlaces } from "./types.js";

interface SubCircleSearchParams {
  initialCenter: LatLng;
  initialRadius: number;
  fetchPlaces: FetchPlaces;
  saturationLimit?: number;
}

export async function subCircleSearch({
  fetchPlaces,
  initialCenter,
  initialRadius,
  saturationLimit = 20, // assumes working with Google NearPlaces
}: SubCircleSearchParams) {
  const makeCircleId = createIdentity();
  const initialCircle: CircleWithID = {
    center: initialCenter,
    radius: initialRadius,
    id: makeCircleId(),
  };

  const coveredCircles: CircleWithID[] = [];
  const uncoveredCircles = [initialCircle];

  const globalPlacesMap = new Map<string, Place>();
  const isWithinInitialCircle = generateIsWithinCircle(initialCircle);
  const getSourceCircle = (sourceId: number) => coveredCircles.find(c => c.id === sourceId);

  while (uncoveredCircles.length > 0) {
    // prioritize large sub-circles to improve performance
    uncoveredCircles.sort((a, b) => b.radius - a.radius);
    const circle = uncoveredCircles.shift()!;

    if (
      !isWithinInitialCircle({ location: circle.center }) ||
      !respectsNOC(circle, coveredCircles)
    ) {
      continue
    };

    const localPlaces = await fetchPlaces(circle);
    addPlacesToMap(localPlaces, globalPlacesMap, isWithinInitialCircle);

    if (localPlaces.length < saturationLimit) {
      if (!circle.sourceId) { // if initial circle
        coveredCircles.push(circle);
      } else {
        const sourceCircle = getSourceCircle(circle.sourceId)!;
        const expandedCircle = await expandCircle({
          circle,
          fetchPlaces,
          getCircleId: makeCircleId,
          saturationLimit,
          maxRadius: initialRadius,
          sourceCenter: sourceCircle.center,
          isWithinInitialCircle,
        });
        coveredCircles.push(expandedCircle);
        uncoveredCircles.push(...tesselateFrom({
          makeCircleId,
          globalPlacesMap,
          saturationLimit,
          barycenter: expandedCircle.center,
          localDensityScale: expandedCircle.radius,
          sourceId: expandedCircle.id,
        }))
      }

      continue;
    }

    const saturatedCircle = await getSaturatedCircleAtBarycenter({
      callerCircle: circle,
      saturationLimit,
      globalPlacesMap,
      makeCircleId,
      fetchPlaces,
      isWithinInitialCircle,
    });

    coveredCircles.push(saturatedCircle);

    uncoveredCircles.push(...tesselateFrom({
      makeCircleId,
      globalPlacesMap,
      saturationLimit,
      barycenter: saturatedCircle.center,
      localDensityScale: saturatedCircle.radius,
      sourceId: saturatedCircle.id,
    }));
  }

  return [...globalPlacesMap.values()];
}
