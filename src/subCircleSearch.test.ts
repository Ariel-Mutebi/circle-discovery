import { describe, it, expect } from "vitest";
import { subCircleSearch } from "./subCircleSearch.js";
import type { Circle, Place, LatLng } from "./types.js";
import { distanceBetween } from "./utils/cartesian.js";

type PlaceWithLocation = Required<Place>;

function randomLatLng(): LatLng {
  // uniform sphere sampling
  const u = Math.random();
  const v = Math.random();

  return {
    latitude: Math.asin(2 * u - 1) * (180 / Math.PI),
    longitude: 360 * v - 180,
  };
}

function hashNumber(n: number): number {
  // fast deterministic float hash
  const x = Math.sin(n * 12_989.8) * 43758.5453;
  return x - Math.floor(x);
}

function stableRank(place: PlaceWithLocation, circle: Circle): number {
  const { latitude, longitude } = place.location;

  return hashNumber(
    latitude * 31_337 +
    longitude * 97_531 +
    circle.center.latitude * 13_579 +
    circle.center.longitude * 24_681 +
    circle.radius,
  );
}

describe("subCircleSearch coverage", () => {
  it("finds ≥80% of places inside the search circle", async () => {
    /* ---------- ground truth world ---------- */

    const WORLD_PLACES = Array.from({ length: 3000 }, () => ({
      location: randomLatLng(),
    })) as PlaceWithLocation[];

    const initialCircle: Circle = {
      center: randomLatLng(),
      radius: 25_000,
    };

    /* ---------- Google Nearby simulation ---------- */

    const fetchPlaces = async (circle: Circle): Promise<Place[]> => {
      const candidates = WORLD_PLACES.filter(p =>
        distanceBetween(p.location, circle.center) <= circle.radius,
      );

      // deterministic ranking per query
      const ranked = [...candidates].sort(
        (a, b) => stableRank(a, circle) - stableRank(b, circle),
      );

      // simulate Nearby cap
      return Promise.resolve(ranked.slice(0, 20));
    };
    /* ---------- run algorithm ---------- */

    const foundPlaces = await subCircleSearch({
      initialCenter: initialCircle.center,
      initialRadius: initialCircle.radius,
      fetchPlaces,
    });

    /* ---------- compute ground truth ---------- */

    const truePlaces = WORLD_PLACES.filter(p =>
      distanceBetween(p.location, initialCircle.center) <=
      initialCircle.radius,
    );

    /* ---------- measure coverage ---------- */

    const foundSet = new Set(foundPlaces);

    const discovered = truePlaces.filter(p => foundSet.has(p));

    const coverage =
      truePlaces.length === 0
        ? 1
        : discovered.length / truePlaces.length;

    console.log({
      totalTrue: truePlaces.length,
      found: discovered.length,
      coverage,
    });

    expect(coverage).toBeGreaterThanOrEqual(0.8);
  });
});
