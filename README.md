# circle-discovery

Efficiently discover all points of interest within a geographic circle, bypassing result limits in nearby-search APIs using barycentric fixed-mass search.

## The problem

Many nearby-search APIs return only a limited number of results per query. For any area with more points of interest than the API limit — a city centre, a dense neighbourhood — you'll silently miss results. Naively subdividing the search area into a grid wastes API quota and still doesn't guarantee complete coverage.

## How it works

`circle-discovery` adapts the [Barycentric Fixed-Mass Method](https://journals.aps.org/pre/abstract/10.1103/PhysRevE.88.022922) (Kamer, Ouillon & Sornette, 2013), a technique from multifractal analysis, into an adaptive spatial search. It works by:

1. Querying a circle and finding the barycenter of the results
2. Stabilizing the barycenter iteratively to locate the true density centre
3. Computing a **local density scale** — the radius needed to capture approximately the API saturation limit at the local density
4. Expanding outward with sub-circles sized to that density scale, using a **nonoverlapping coverage** criterion to avoid redundant queries
5. Repeating until the entire initial circle is covered

This means the algorithm self-calibrates: dense urban areas get small, tightly-packed sub-circles; sparse areas get large ones. API calls are never wasted on already-covered regions.

Watch the algorithm in action here: [https://circle-revelation.pages.dev/](https://circle-revelation.pages.dev/)

## Installation

```bash
npm install @ariel-mutebi/circle-discovery
```

## Usage

The package is agnostic about how you call your places API. You provide a `fetchPlaces` function that takes a circle and returns a promise of places — the algorithm handles the rest.

### Basic example

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

The algorithm assumes that when a query returns `saturationLimit` places, the queried area may still contain undiscovered places and should therefore be subdivided further.

For example:

* Google Places Nearby Search → `saturationLimit: 20`

## Considerations

### API quota

The algorithm minimises calls through nonoverlapping coverage, but a large radius over a dense area will still generate many queries. Test with a small `initialRadius` first.

### Rate limiting

If your `fetchPlaces` function needs to respect rate limits, handle that inside the function itself before returning results.

### Radius units

`initialRadius` and all internal distance calculations are in metres. Make sure your `fetchPlaces` implementation uses the same unit.

### Deduplication

Places are deduplicated globally by `place.id`. Ensure your provider exposes stable unique identifiers.

## Background

This algorithm is inspired by the Barycentric Fixed-Mass Method introduced in:

> Y. Kamer, G. Ouillon, and D. Sornette, *"Barycentric fixed-mass method for multifractal analysis"*, Physical Review E 88, 022922 (2013).

The key concepts adapted from that paper are barycentric pivot selection (centering queries on the true density centre of results) and nonoverlapping coverage (preventing redundant sampling of already-covered areas).
