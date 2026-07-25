import type { Load } from "./types";
import { remainingStops } from "./truckerpath";

// PingPoint NAV server (nginx /nav/ -> pm2 pingpoint-nav). POST /api/load-route
// builds a truck-legal route (13'6" / 80k lbs default profile) and returns a
// Google Maps /maps/dir/ URL densely pinned with ~78 route samples. Google is
// a car router — without the pinning it would pull the truck off the
// truck-safe path, so the engine URL is the only one safe to navigate by.
const NAV_API_BASE = "https://pingpoint.suverse.io/nav";
const REQUEST_TIMEOUT_MS = 45000;

export type GoogleRouteResult =
  | {
      state: "ready";
      url: string;
      waypointCount: number;
      distanceMi: number;
      durationMin: number;
    }
  | { state: "error" };

const fmt = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

// Fallback when the engine is down: real stops only, Google picks its own
// (car) route. Leading empty segment => Google routes from "My Location".
export function buildSimpleGoogleLink(load: Load): string | null {
  const remaining = remainingStops(load);
  if (remaining.length === 0) return null;
  if (remaining.some((s) => s.lat == null || s.lng == null)) return null;
  const points = ["", ...remaining.map((s) => fmt(s.lat!, s.lng!))];
  return `https://www.google.com/maps/dir/${points.join("/")}`;
}

export async function fetchGoogleTruckRoute(
  load: Load,
  origin: { lat: number; lng: number },
): Promise<GoogleRouteResult> {
  const remaining = remainingStops(load);
  if (
    remaining.length === 0 ||
    remaining.some((s) => s.lat == null || s.lng == null)
  ) {
    return { state: "error" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(`${NAV_API_BASE}/api/load-route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin,
        stops: remaining.map((s) => ({ lat: s.lat, lng: s.lng })),
      }),
      signal: controller.signal,
    });
    if (!resp.ok) return { state: "error" };
    const data = await resp.json();
    if (
      !data ||
      typeof data.url !== "string" ||
      !data.url.startsWith("https://www.google.com/maps/dir/")
    ) {
      return { state: "error" };
    }
    return {
      state: "ready",
      url: data.url,
      waypointCount: data.waypointCount ?? 0,
      distanceMi: data.distance_mi ?? 0,
      durationMin: data.duration_min ?? 0,
    };
  } catch {
    return { state: "error" };
  } finally {
    clearTimeout(timer);
  }
}
