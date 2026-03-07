// Some days I wish that the Earth were flat.
import type { LatLng } from "../types.js";
import { clamp } from "./filters.js";

const EARTH_RADIUS_METRES = 6_371_000;

// Conversion and normalization helpers
function toRadians(degrees: number) {
  return degrees * Math.PI / 180;
}

function toDegrees(radians: number) {
  return radians * 180 / Math.PI;
}

// Normalize longitude to [-180, 180]
function normalizeLongitude(lng: number): number {
  return ((lng + 540) % 360) - 180;
}

// Normalize any angle in degrees to [0, 360)
function normalizeAngle360(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

interface ThreeDimensionalCartesian {
  x: number;
  y: number;
  z: number;
}

export function latLngToCartesian(coordinate: LatLng): ThreeDimensionalCartesian {
  const lat = toRadians(coordinate.latitude);
  const lng = toRadians(coordinate.longitude);

  const x = Math.cos(lat) * Math.cos(lng);
  const y = Math.cos(lat) * Math.sin(lng);
  const z = Math.sin(lat);

  return { x, y, z };
}

export function cartesianToLatLng({ x, y, z }: ThreeDimensionalCartesian): LatLng {
  const hyp = Math.sqrt(x * x + y * y);

  const lat = Math.atan2(z, hyp);
  const lng = Math.atan2(y, x);

  return {
    latitude: toDegrees(lat),
    longitude: toDegrees(lng),
  };
}

export function distanceBetween(a: LatLng, b: LatLng) {
  const A = latLngToCartesian(a);
  const B = latLngToCartesian(b);
  /**
   * A · B = |A| |B| cos(θ)
   * but |A| = |B| = 1
   * so A · B = cos(θ)
  */
  const dot = A.x * B.x + A.y * B.y + A.z * B.z;

  // 1 ≤ cos(θ) ≤ 1: no room for floating point errors
  const angle = Math.acos(clamp(-1, dot, 1));

  return EARTH_RADIUS_METRES * angle;
}

// Bearing (initial great-circle direction)
export function calculateBearing(A: LatLng, B: LatLng): number {
  const lat1 = toRadians(A.latitude);
  const lat2 = toRadians(B.latitude);
  const deltaLng = toRadians(B.longitude - A.longitude);

  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

  const theta = Math.atan2(y, x);
  return normalizeAngle360(toDegrees(theta));
}

// Solution to the forward geodetic problem (trying to sound smart).
export function move(start: LatLng, distance: number, bearing: number) {
  const lat1 = toRadians(start.latitude);
  const lng1 = toRadians(start.longitude);
  const theta = toRadians(bearing);
  const delta = distance / EARTH_RADIUS_METRES;

  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);

  const sinDelta = Math.sin(delta);
  const cosDelta = Math.cos(delta);

  const lat2 = Math.asin(sinLat1 * cosDelta + cosLat1 * sinDelta * Math.cos(theta));

  const lng2 = lng1 + Math.atan2(
    Math.sin(theta) * sinDelta * cosLat1,
    cosDelta - sinLat1 * Math.sin(lat2),
  );

  return {
    latitude: toDegrees(lat2),
    longitude: normalizeLongitude(toDegrees(lng2)),
  };
}

export function extendLine(A: LatLng, B: LatLng, dist: number) {
  return move(B, dist, calculateBearing(A, B));
}
