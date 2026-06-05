# circle-discovery

Efficiently discover all points of interest within a geographic circle, bypassing result limits in nearby-search APIs using an adaptive barycentric search.

## The problem

Many nearby-search APIs return only a limited number of results per query. For any area with more points of interest than the API limit — a city centre, a dense neighbourhood — you'll silently miss results. Naively subdividing the search area into a grid wastes API quota and still doesn't guarantee complete coverage.

## How it works

`circle-discovery` is inspired by the [Barycentric Fixed-Mass Method](https://journals.aps.org/pre/abstract/10.1103/PhysRevE.88.022922) (Kamer, Ouillon & Sornette, 2013), a technique from multifractal analysis. Two concepts from that paper are used directly:

- **Barycentric pivot selection**: rather than centering queries at arbitrary points, each circle is centered on the barycenter (center of mass) of the places found so far, keeping queries anchored to actual density.
- **Nonoverlapping coverage (NOC)**: a circle is only queried if its center is at least `0.86 × (r₁ + r₂)` from every already-covered circle, producing a tight tiling without redundant sampling. The 0.86 factor comes from the paper's geometric derivation of the minimum overlap needed for complete coverage (~13.4%).

Beyond those two principles, the algorithm departs significantly from the paper to address real-world API constraints the paper was never designed for. The paper operates on a fixed, fully-known point set and is concerned with computing multifractal spectra. This library operates in the opposite regime: the point set is unknown, and the goal is to discover it efficiently under a hard per-query result cap.

The adaptations that address this are:

### Interior exploration

When a query returns a saturated result (hitting the API limit), the algorithm locates the tightest saturated circle at the barycenter using binary search — contracting the radius until the smallest circle that still returns a full result is found. This is the **local density scale**: the radius that accurately reflects the local concentration of places.

Throughout this process, globally memoized places are used to avoid redundant API calls. Whenever already-known places within a candidate circle are sufficient to determine saturation, the API call is skipped entirely.

### Frontier exploration

From each resolved density centre, six sub-circles are tessellated hexagonally outward. Directions where the global map already contains a high fraction of known places are pruned before spawning, focusing exploration on genuinely unknown territory.

When a frontier sub-circle comes back unsaturated, the algorithm probes outward in the same direction — moving both center and edge together so the inner boundary stays fixed at the NOC constraint. Expansion stops when saturation is found or the circle center leaves the initial search boundary.

The result is a self-calibrating algorithm: dense areas produce small, tightly-packed circles; sparse areas produce large ones. Approximately 5–6 new places are discovered per API call on average.

Watch the algorithm in action: [https://circle-revelation.pages.dev/](https://circle-revelation.pages.dev/)

## Installation

```bash
npm install @ariel-mutebi/circle-discovery
```

## Usage

The package is agnostic about how you call your places API. You provide a `fetchPlaces` function that takes a circle and returns a promise of places — the algorithm handles the rest.

```typescript
import { subCircleSearch } from "@ariel-mutebi/circle-discovery";

const restaurants = await subCircleSearch({
  initialCenter: {
    latitude: 40.7128,
    longitude: -74.0060,
  }, // New York
  initialRadius: 1000,
  saturationLimit: 20,
  fetchPlaces: async ({ center, radius }) => {
    return fetchNearbyPlaces({
      center,
      radius,
      type: "restaurant",
    });
  },
});
```

## API

### `subCircleSearch(params)`

**Parameters**

| Name              | Type                                   | Description                                                                                     |
| ----------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `initialCenter`   | `LatLng`                               | Centre of the search area                                                                       |
| `initialRadius`   | `number`                               | Radius of the search area in metres                                                             |
| `saturationLimit` | `number`                               | Maximum number of places returned by a single API query before the area is considered saturated |
| `fetchPlaces`     | `(circle: Circle) => Promise<Place[]>` | Function that queries your places API                                                           |

**Returns**

`Promise<Place[]>` — deduplicated array of all places found within the initial circle.

### Types

```typescript
interface LatLng {
  latitude: number;
  longitude: number;
}

interface Circle {
  center: LatLng;
  radius: number;
}

interface Place {
  id: string;
  location?: LatLng;
  [key: string]: unknown;
}
```

## Saturation limits

The algorithm treats a query returning `saturationLimit` results as a signal that the area may contain more undiscovered places and should be explored further.

| Provider                      | `saturationLimit` |
| ----------------------------- | ----------------- |
| Google Places Nearby Search   | `20`              |

## Considerations

### API quota

The algorithm minimises calls through NOC constraints, memoized place reuse, and directional pruning — but a large radius over a dense area will still generate many queries. Test with a small `initialRadius` first.

### Rate limiting

Handle rate limiting inside your `fetchPlaces` implementation before returning results.

### Radius units

All internal distance calculations are in metres. Ensure your `fetchPlaces` implementation uses the same unit.

### Deduplication

Places are deduplicated globally by `place.id`. Ensure your provider exposes stable unique identifiers.

## Background

This algorithm is inspired by the Barycentric Fixed-Mass Method introduced in:

> Y. Kamer, G. Ouillon, and D. Sornette, *"Barycentric fixed-mass method for multifractal analysis"*, Physical Review E 88, 022922 (2013).

The paper's original purpose is computing multifractal spectra of a fully-known point distribution. The adaptation here repurposes its two core geometric criteria — barycentric pivot selection and nonoverlapping coverage — for a fundamentally different problem: discovering an unknown point set under a hard per-query result cap.
