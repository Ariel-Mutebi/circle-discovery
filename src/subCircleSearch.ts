import {
  respectsNOC,
  stabilizeBarycenter,
  generateSubCircles,
  expandCircle,
} from "./utils/BFM.js";
import {
  createIdentity,
  addPlacesToMap,
  makeIsWithinInitialCircle,
} from "./utils/filters.js";
import type { Place, LatLng, CircleWithID, FetchPlaces } from "./types.js";

interface SubCircleSearchParams {
  initialCenter: LatLng;
  initialRadius: number;
  fetchPlaces: FetchPlaces;
}

export async function subCircleSearch({
  fetchPlaces,
  initialCenter,
  initialRadius,
}: SubCircleSearchParams) {
  const getCircleId = createIdentity();
  const coveredCircles: CircleWithID[] = [];
  const uncoveredCircles: CircleWithID[] = [{
    center: initialCenter,
    radius: initialRadius,
    id: getCircleId(),
  }];

  const globalPlacesMap = new Map<string, Place>();
  const isWithinInitialCircle = makeIsWithinInitialCircle(initialCenter, initialRadius);
  const getSourceCircle = (sourceId: number) => coveredCircles.find(c => c.id === sourceId);

  while (uncoveredCircles.length > 0) {
    // prioritize large sub-circles to improve performance
    uncoveredCircles.sort((a, b) => b.radius - a.radius);

    const circle = uncoveredCircles.shift()!;

    if (!isWithinInitialCircle(circle.center) || !respectsNOC(circle, coveredCircles)) continue;

    const localPlaces = await fetchPlaces(circle);
    addPlacesToMap(localPlaces, globalPlacesMap, isWithinInitialCircle);

    if (localPlaces.length < 20) {
      if (!circle.sourceId) { // if initial circle
        coveredCircles.push(circle);
      } else {
        const sourceCircle = getSourceCircle(circle.sourceId)!;
        coveredCircles.push(await expandCircle({
          circle,
          fetchPlaces,
          getCircleId,
          maxRadius: initialRadius,
          sourceCenter: sourceCircle.center,
        }));
      }

      continue;
    }

    const localPlacesMap = new Map<string, Place>(localPlaces.map(p => [p.id, p]));
    const stabilizedBarycenterCircle = await stabilizeBarycenter({
      localPlacesMap,
      getCircleId,
      fetchPlaces,
      addToGlobalPlacesMap: (p) => addPlacesToMap(p, globalPlacesMap, isWithinInitialCircle),
    });

    coveredCircles.push(stabilizedBarycenterCircle);

    uncoveredCircles.push(...generateSubCircles({
      barycenter: stabilizedBarycenterCircle.center,
      localDensityScale: stabilizedBarycenterCircle.radius,
      sourceId: stabilizedBarycenterCircle.id,
      getCircleId,
    }));
  }

  return [...globalPlacesMap.values()];
}
