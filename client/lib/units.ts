// THE unit-conversion helper (mirror of PingPoint shared/units.ts).
// US market: everything user-facing is MILES / MPH; the ELD stream and ping
// bodies stay in native km. No ad-hoc conversion factors in feature code.

export const KM_PER_MI = 1.609344;

export function kmToMi(km: number): number {
  return km / KM_PER_MI;
}

export function kphToMph(kph: number): number {
  return kph / KM_PER_MI;
}
