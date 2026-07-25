import { Platform } from "react-native";

import type { Load, Stop } from "./types";

// Official Trucker Path cal_route deep link, same scheme PingPoint NAV
// exports (pingpoint-nav api.ts buildTruckerPathURLs):
//   iOS:     truckerpath://cal_route?daddr=LAT,LNG&paddr=LAT,LNG|LAT,LNG
//   Android: truckerpath://cal_route?d_addr=...&p_addr=LAT,LNG|LAT,LNG
// The start param (saddr/s_addr) is omitted on purpose — TP then routes
// from the device's current position, which covers deadhead to pickup.
// Only REAL stops go in: TP does its own truck routing, so synthetic
// route points must never be sent.

export type TruckerPathLink =
  | { state: "ready"; url: string; stopCount: number }
  | { state: "missing-coords" }
  | { state: "no-remaining" };

const fmt = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

export function remainingStops(load: Load): Stop[] {
  // ARRIVED counts as done for routing: the driver is already on-site, the
  // route that matters is everything still ahead of them.
  return load.stops
    .filter((s) => s.status === "PENDING")
    .sort((a, b) => a.sequence - b.sequence);
}

export function buildTruckerPathLoadLink(
  load: Load,
  platform: string = Platform.OS,
): TruckerPathLink {
  const remaining = remainingStops(load);
  if (remaining.length === 0) return { state: "no-remaining" };
  if (remaining.some((s) => s.lat == null || s.lng == null)) {
    return { state: "missing-coords" };
  }

  const dest = remaining[remaining.length - 1];
  const via = remaining
    .slice(0, -1)
    .map((s) => fmt(s.lat!, s.lng!))
    .join("|");

  const [destKey, viaKey] =
    platform === "ios" ? ["daddr", "paddr"] : ["d_addr", "p_addr"];
  const parts = [`${destKey}=${fmt(dest.lat!, dest.lng!)}`];
  if (via) parts.push(`${viaKey}=${via}`);

  return {
    state: "ready",
    url: `truckerpath://cal_route?${parts.join("&")}`,
    stopCount: remaining.length,
  };
}
