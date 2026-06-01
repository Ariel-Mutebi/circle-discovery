import {
  stabilizeBarycenter,
  generateSubCircles,
  expandCircle,
} from "./utils/BFM.js";
import {
  createIdentity,
  addPlacesToMap,
  generateIsWithinCircle,
  predictQueryEfficiency,
} from "./utils/filters.js";
import type { Place, LatLng, CircleWithID, FetchPlaces } from "./types.js";
import { distanceBetween } from "./utils/cartesian.js";

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
  const getCircleId = createIdentity();
  const initialCircle: CircleWithID = {
    center: initialCenter,
    radius: initialRadius,
    id: getCircleId(),
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
      (predictQueryEfficiency(circle, [...globalPlacesMap.values()], saturationLimit) < 0.5)
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
          getCircleId,
          saturationLimit,
          maxRadius: initialRadius,
          sourceCenter: sourceCircle.center,
        });
        coveredCircles.push(expandedCircle);
        uncoveredCircles.push(...generateSubCircles({
          barycenter: expandedCircle.center, // not true, but a reasonable heuristic
          localDensityScale: expandedCircle.radius,
          sourceId: expandedCircle.id,
          getCircleId,
        }))
      }

      continue;
    }

    const stabilizedBarycenterCircle = await stabilizeBarycenter({
      saturationLimit,
      globalPlacesMap,
      getCircleId,
      fetchPlaces,
      isWithinInitialCircle,
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
