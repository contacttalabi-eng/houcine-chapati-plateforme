import type { LatLng } from "../types";

const coords = (p: LatLng) => `${p.lat.toFixed(7)},${p.lng.toFixed(7)}`;

/**
 * Ouvre Google Maps (application sur téléphone, site sur ordinateur) avec
 * l'itinéraire vers `destination`. Sans `origin`, Google part de la position
 * actuelle de l'appareil — c.-à-d. la position du livreur — et lance la
 * navigation guidée (dir_action=navigate).
 */
export function directionsUrl(destination: LatLng, origin?: LatLng | null): string {
  const params = new URLSearchParams({ api: "1", destination: coords(destination), travelmode: "driving" });
  if (origin) params.set("origin", coords(origin));
  else params.set("dir_action", "navigate");
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Ouvre un point précis dans Google Maps. */
export function placeUrl(point: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${coords(point)}`;
}

export const toLatLng = (lat: number | null | undefined, lng: number | null | undefined): LatLng | null =>
  lat == null || lng == null ? null : { lat, lng };
