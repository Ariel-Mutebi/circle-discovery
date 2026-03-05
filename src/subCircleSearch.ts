import { respectsNOC, calculateBarycenter, calculateLocalDensityScale } from "./utils/BFM.js";
import { distanceBetween, extendLine, reflectAcross, move } from "./utils/cartesian.js";
import { createIdentity, limit, coordinatesOfPlaces } from "./utils/filters.js";
import type { Circle, Place, LatLng } from "./types.js";

interface SubCircleSearchParams {
  initialCenter: LatLng;
  initialRadius: number;
  fetchPlaces: (circle: Circle) => Promise<Place[]>;
}

export async function subCircleSearch({
  fetchPlaces,
  initialCenter,
  initialRadius,
}: SubCircleSearchParams) {
  interface CircleWithID extends Circle {
    id: number;
    sourceId?: number;
  }

  const getCircleId = createIdentity();
  const queriedCircles: CircleWithID[] = [];
  const coveredCircles: CircleWithID[] = [];

  const uncoveredCircles: CircleWithID[] = [{
    center: initialCenter,
    radius: initialRadius,
    id: getCircleId(),
  }];

  const getSourceCircle = (sourceId: number) => queriedCircles.find(c => c.id === sourceId);

  const globalPlaceMap = new Map<string, Place>();

  const isWithinInitialCircle = (point: LatLng) =>
    distanceBetween(initialCenter, point) < initialRadius;

  const addToGlobal = (places: Place[]) => {
    for (const place of places) {
      if (place.id && place.location && isWithinInitialCircle(place.location)) {
        globalPlaceMap.set(place.id, place);
      }
    }
  };

  while (uncoveredCircles.length > 0) {
    // prioritize large sparse probes to improve performance
    uncoveredCircles.sort((a, b) => b.radius - a.radius);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const circle = uncoveredCircles.shift()!;
    const { center, radius } = circle;

    if (!isWithinInitialCircle(center) || !respectsNOC(circle, coveredCircles)) {
      continue;
    }

    const localPlaces = await fetchPlaces(circle);
    queriedCircles.push(circle);

    addToGlobal(localPlaces);

    if (localPlaces.length < 20) {
      // If it's the initial circle, just exit the loop.
      if (!circle.sourceId) {
        coveredCircles.push(circle);
        continue;
      };

      /**
       * Correction to increase radius to new local density scale and move further out when
       * expanding from dense areas. Dense areas need small radii due to a high local density,
       * sparse areas need small large due to a low local density. Without this correction,
       * the algorithm would only shrink the radii of sub-circles as it searched dense areas,
       * and never expand their radii going into sparser areas, causing massive oversampling.
       */
      const EXPANSION_FACTOR = 1.25;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const sourceCircle = getSourceCircle(circle.sourceId)!;

      let bigEnoughCircle = circle;

      while (bigEnoughCircle.radius < initialRadius) {
        const biggerRadius = limit(bigEnoughCircle.radius * EXPANSION_FACTOR, initialRadius);
        const deltaRadius = biggerRadius - bigEnoughCircle.radius;

        const adjustedCenter = extendLine(
          sourceCircle.center,
          bigEnoughCircle.center,
          deltaRadius,
        );

        const biggerCircle: CircleWithID = {
          radius: biggerRadius,
          center: adjustedCenter,
          id: getCircleId(),
        };

        const results = await fetchPlaces(biggerCircle);

        if (results.length === 20) break;
        bigEnoughCircle = biggerCircle;
      }

      coveredCircles.push(bigEnoughCircle);

      continue;
    }

    // Stabilize local Barycenter
    const localPlaceMap = new Map<string, Place>(
      localPlaces.filter(p => p.id).map(p => [p.id, p]),
    );

    let stabilizedBarycenter =
      calculateBarycenter(coordinatesOfPlaces([...localPlaceMap.values()]));

    let placesFromLastStabilizationQuery: Place[] = [];
    let idOfLastStabilizationCircle = -1;

    const EPSILON = radius * 0.1;
    const MAX_ITERATIONS = 10;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const stabilizationCircle: Circle = { center: stabilizedBarycenter, radius };
      placesFromLastStabilizationQuery = await fetchPlaces(stabilizationCircle);

      idOfLastStabilizationCircle = getCircleId();
      queriedCircles.push({ ...stabilizationCircle, id: idOfLastStabilizationCircle });

      addToGlobal(placesFromLastStabilizationQuery);

      for (const place of placesFromLastStabilizationQuery) {
        if (place.id) localPlaceMap.set(place.id, place);
      }

      const newBarycenter = calculateBarycenter(
        coordinatesOfPlaces([...localPlaceMap.values()]));

      const improvement =
        distanceBetween(stabilizedBarycenter, newBarycenter);

      stabilizedBarycenter = newBarycenter;

      if (improvement <= EPSILON) break;
    }

    /**
     * If the circle around the stabilized Barycenter is fully discovered,
     * reflect it into the sparse region to pick up a few places from there.
     */
    if (placesFromLastStabilizationQuery.length < 20) {
      coveredCircles.push({
        radius,
        center: stabilizedBarycenter,
        id: idOfLastStabilizationCircle,
      });

      uncoveredCircles.push({
        radius,
        id: getCircleId(),
        sourceId: idOfLastStabilizationCircle,
        center: reflectAcross(center, stabilizedBarycenter),
      });
    }

    /**
     * Explore around Barycenter with sub-circles of smaller radii (less API saturation).
     * Their radii are set to the local density scale (the radius to capture 20 places).
     */
    const localDensityScale = calculateLocalDensityScale(
      stabilizedBarycenter,
      coordinatesOfPlaces([...localPlaceMap.values()]),
    );

    uncoveredCircles.push(
      ...[0, 60, 120, 180, 240, 300]
        .map(direction => ({
          center: move(
            stabilizedBarycenter,
            localDensityScale * Math.sqrt(3), // achieve 13.4% the overlap that the paper suggests.
            direction,
          ),
          radius: localDensityScale,
          id: getCircleId(),
          sourceId: circle.id,
        }) as CircleWithID),
    );
  }

  return [...globalPlaceMap.values()];
}