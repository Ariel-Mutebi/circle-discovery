# sub-circle-search

Efficiently discover all points of interest within a geographic circle, bypassing the 20-result limit of the Google Places Nearby Search API.

## The problem

Google's Nearby Search API returns at most 20 results per query. For any area with more than 20 POIs — a city centre, a dense neighbourhood — you'll silently miss results. Naively subdividing the search area into a grid wastes API quota and still doesn't guarantee complete coverage.

## How it works

`sub-circle-search` adapts the [Barycentric Fixed-Mass Method](https://journals.aps.org/pre/abstract/10.1103/PhysRevE.88.022922) (Kamer, Ouillon & Sornette, 2013), a technique from multifractal analysis, into an adaptive spatial search. It works by:

1. Querying a circle and finding the barycenter of the results
2. Stabilizing the barycenter iteratively to locate the true density centre
3. Computing a **local density scale** — the radius needed to capture ~20 places at the local density
4. Expanding outward with sub-circles sized to that density scale, using a **nonoverlapping coverage** criterion to avoid redundant queries
5. Repeating until the entire initial circle is covered

This means the algorithm self-calibrates: dense urban areas get small, tightly-packed sub-circles; sparse areas get large ones. API calls are never wasted on already-covered regions.

## Installation

```bash
npm install sub-circle-search
```

## Usage

The package is agnostic about how you call the Google Places API. You provide a `fetchPlaces` function that takes a circle and returns a promise of places — the algorithm handles the rest.

### Basic example

```typescript
import { subCircleSearch } from 'sub-circle-search';

const places = await subCircleSearch({
  initialCenter: { lat: 51.5074, lng: -0.1278 }, // Central London
  initialRadius: 2000, // metres
  fetchPlaces: async ({ center, radius }) => {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
      `?location=${center.lat},${center.lng}` +
      `&radius=${radius}` +
      `&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );
    const data = await response.json();
    return data.results.map(r => ({
      location: {
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
      },
      // pass through any other fields you need
      ...r,
    }));
  },
});

console.log(`Found ${places.length} places`);
```

### With the Google Maps JavaScript SDK

```typescript
import { subCircleSearch } from 'sub-circle-search';

const { Place } = await google.maps.importLibrary('places');

const places = await subCircleSearch({
  initialCenter: { lat: 48.8566, lng: 2.3522 }, // Paris
  initialRadius: 1500,
  fetchPlaces: async ({ center, radius }) => {
    const { places } = await Place.searchNearby({
      locationRestriction: {
        center,
        radius,
      },
      maxResultCount: 20,
      fields: ['location', 'displayName', 'types'],
    });
    return places.map(p => ({
      location: p.location
        ? { lat: p.location.lat(), lng: p.location.lng() }
        : undefined,
      name: p.displayName,
      types: p.types,
    }));
  },
});
```

### Filtering by type

```typescript
const restaurants = await subCircleSearch({
  initialCenter: { lat: 40.7128, lng: -74.0060 }, // New York
  initialRadius: 1000,
  fetchPlaces: async ({ center, radius }) => {
    // pass type filters through to your API call as needed
    return fetchNearbyPlaces({ center, radius, type: 'restaurant' });
  },
});
```

## API

### `subCircleSearch(params)`

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `initialCenter` | `LatLng` | Centre of the search area |
| `initialRadius` | `number` | Radius of the search area in metres |
| `fetchPlaces` | `(circle: Circle) => Promise<Place[]>` | Function that queries your places API |

**Returns**

`Promise<Place[]>` — deduplicated array of all places found within the initial circle.

### Types

```typescript
interface LatLng {
  lat: number;
  lng: number;
}

interface Circle {
  center: LatLng;
  radius: number;
}

interface Place {
  location?: LatLng;
  [key: string]: unknown; // any additional fields from your API
}
```

## Considerations

**API quota** — the algorithm minimises calls through nonoverlapping coverage, but a large radius over a dense area will still generate many queries. Test with a small `initialRadius` first.

**Rate limiting** — if your `fetchPlaces` function needs to respect rate limits, handle that inside the function itself before returning results.

**Radius units** — `initialRadius` and all internal distance calculations are in metres. Make sure your `fetchPlaces` implementation uses the same unit.

## Background

This algorithm is inspired by the Barycentric Fixed-Mass Method introduced in:

> Y. Kamer, G. Ouillon, and D. Sornette, *"Barycentric fixed-mass method for multifractal analysis"*, Physical Review E 88, 022922 (2013).

The key concepts adapted from that paper are barycentric pivot selection (centering queries on the true density centre of results) and nonoverlapping coverage (preventing redundant sampling of already-covered areas).

## License

MIT