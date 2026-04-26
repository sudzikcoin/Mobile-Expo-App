import { IOSiXData, emptyIOSiXData } from "./types";

// IOSiX PT30 BLE wire format: a CRLF-terminated CSV packet containing 19
// fields preceded by a "Data: 1," marker. BLE notify fragments may prepend
// a one-byte counter; the regex is intentionally non-anchored so those
// prefix bytes are tolerated implicitly (matches anywhere in the line).
//
// IMPORTANT: this regex must stay in sync with the server-side parser at
// /root/PingPoint/server/routes.ts (IOSIX_LINE_RE). When fields change in
// firmware, update both copies together.
//
// Field map (server-side authoritative documentation):
//   m[1]  VIN            m[2]  f2  unreliable narrow-band int (legacy "rpm")
//   m[3]  GPS speed kph  m[4]  odometer miles    m[5]  trip miles
//   m[6]  engine hours   m[7]  cumulative trip fuel (gallons, monotonic)
//   m[8]  battery V      m[9]  date MM/DD/YY     m[10] time HH:MM:SS UTC
//   m[11] lat            m[12] lng
//   m[13] wheel speed    m[14] heading 0-358°    m[15] gear 0-10
//   m[16] DO NOT USE     m[17] f17 instantaneous fuel rate × 0.1 L/h
//                              (sentinel 99.9 = unavailable)
//   m[18] session counter (~1Hz)                 m[19] packet flag (349)
const IOSIX_LINE_RE =
  /Data:\s*1,([A-Z0-9]{1,32}),(-?\d+),(-?\d+(?:\.\d+)?),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),(\d{2}\/\d{2}\/\d{2}),(\d{2}:\d{2}:\d{2}),(-?\d+\.\d+),(-?\d+\.\d+),(-?\d+),(-?\d+),(-?\d+),(\d+),([\d.]+),(\d+),(\d+)/;

const KPH_TO_MPH = 0.621371;
const F17_SENTINEL_NO_DATA = 90;
const F17_LPH_PER_TENTH = 10;
const LITERS_PER_GALLON = 3.785;
const FUEL_RATE_MAX_GPH = 12;
const VOLTAGE_MAX = 32;
const REASSEMBLY_BUFFER_MAX = 8192;
const REASSEMBLY_BUFFER_TRIM = 4096;

function num(s: string | undefined): number | null {
  if (s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number | null, min: number, max: number): number | null {
  if (n === null) return null;
  if (n < min || n > max) return null;
  return n;
}

function cleanVin(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(s)) return null;
  return s.slice(0, 17);
}

/**
 * Parse one CRLF-terminated IOSiX PT30 packet. Returns null if the line
 * doesn't match the documented format. Mirror of the server-side parser.
 */
export function parseLine(line: string): IOSiXData | null {
  const m = IOSIX_LINE_RE.exec(line);
  if (!m) return null;

  const data = emptyIOSiXData();
  data.packetCycleComplete = false;

  data.vin = cleanVin(m[1]);

  // f2 is a narrow-band integer often correlating with engine RPM at idle.
  // Server treats it as unreliable; mobile keeps reading it for dashboard
  // parity until a better source is wired up.
  data.rpm = clamp(num(m[2]), 0, 4000);

  const kph = num(m[3]);
  data.speedMph = kph !== null ? Math.round(kph * KPH_TO_MPH * 10) / 10 : null;

  data.odometerMiles = clamp(num(m[4]), 0, 2_000_000);
  data.tripMiles = clamp(num(m[5]), 0, 100_000);
  data.engineHours = clamp(num(m[6]), 0, 200_000);

  // f7 is cumulative trip fuel in gallons (monotonic counter), NOT the
  // instantaneous rate. Storing it as totalFuelUsedGal lines mobile up with
  // the server's tracking_pings.total_fuel_gal column and the BLE protocol.
  data.totalFuelUsedGal = clamp(num(m[7]), 0, 100_000);

  data.batteryVoltage = clamp(num(m[8]), 0, VOLTAGE_MAX);

  if (m[9] && m[10]) {
    const [mo, dd, yy] = m[9].split("/");
    data.gpsTimeUtc = `20${yy}-${mo}-${dd}T${m[10]}Z`;
  }

  data.lat = clamp(num(m[11]), -90, 90);
  data.lng = clamp(num(m[12]), -180, 180);

  // m[13] wheel speed kph: not surfaced — UI uses GPS speed (m[3]).
  data.heading = clamp(num(m[14]), 0, 360);
  data.currentGear = clamp(num(m[15]), 0, 10);

  // f17: instantaneous fuel rate in L/h × 0.1. Apply documented formula
  // (gph = f17 × 10 / 3.785) with sentinel filtering and physical clamp.
  const f17 = num(m[17]);
  let fuelRateGph: number | null = null;
  if (f17 !== null && f17 < F17_SENTINEL_NO_DATA) {
    const gph = (f17 * F17_LPH_PER_TENTH) / LITERS_PER_GALLON;
    if (gph >= 0 && gph <= FUEL_RATE_MAX_GPH) {
      fuelRateGph = Math.round(gph * 100) / 100;
    }
  }
  data.fuelRateGph = fuelRateGph;

  // satellites / gpsAccuracy / altitude: not present in PT30 BLE stream.
  // Expo location subscription supplies accuracy separately.
  data.satellites = null;
  data.gpsAccuracy = null;
  data.altitudeM = null;

  data.packetCycleComplete = true;
  data.lastUpdated = Date.now();
  return data;
}

/**
 * Streaming buffer that consumes raw BLE notify fragments and emits the
 * latest parsed IOSiXData when one or more \r\n-terminated packets have
 * been reassembled. Returns null while still accumulating.
 */
export class IOSiXCycleBuffer {
  private buf: string = "";

  reset(): void {
    this.buf = "";
  }

  push(chunk: string): IOSiXData | null {
    this.buf += chunk;
    let latest: IOSiXData | null = null;
    while (true) {
      const idx = this.buf.indexOf("\r\n");
      if (idx < 0) {
        if (this.buf.length > REASSEMBLY_BUFFER_MAX) {
          this.buf = this.buf.slice(-REASSEMBLY_BUFFER_TRIM);
        }
        break;
      }
      const line = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 2);
      const parsed = parseLine(line);
      if (parsed) latest = parsed;
    }
    return latest;
  }
}
