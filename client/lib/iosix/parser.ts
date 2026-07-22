import { IOSiXData, emptyIOSiXData } from "./types";

// IOSiX PT30 BLE wire format: a CRLF-terminated CSV line of 20 fields
// starting with "Data: ". BLE notify fragments carry a one-byte sequence
// counter that the service layer strips before feeding this parser.
//
// IMPORTANT: this parser must stay in sync with the server-side parser at
// /root/PingPoint/server/iosixFrame.ts. When fields change in firmware,
// update both copies together.
//
// Field map proven by the ground-up stream decode of 2026-07-22
// (field_table.csv, all 20 fields):
//   f0  engine_running 0/1        f1  VIN
//   f2  engine RPM (integer)
//   f3  ECU road speed km/h (hard 0 engine-off, governed at 120)
//   f4  odometer km (0.005 km quantum)
//   f5  distance since engine start, km
//   f6  total engine hours (0.05 h quantum)
//   f7  engine-hours since engine start (0.05 h; NOT fuel — the stream
//       carries no fuel measurement at all)
//   f8  battery voltage (0.01 V)
//   f9  date MM/DD/YY UTC         f10 time HH:MM:SS UTC
//   f11 lat / f12 lng (EMPTY STRINGS when no GPS fix — frame still valid!)
//   f13 GPS ground speed km/h (works engine-off, empty on no fix)
//   f14 GPS heading 0-359         f15 satellites
//   f16 GPS altitude m            f17 HDOP
//   f18 device uptime seconds (uint16, wraps mod 65536)
//   f19 constant 349 — carries no information, ignored
//
// The GPS block f11-f17 goes empty on fix loss (~1.3% of frames) while the
// ECU half stays valid, so parsing must NOT require lat/lng — the old
// regex silently dropped those frames.

const KM_TO_MI = 0.621371;
const REASSEMBLY_BUFFER_MAX = 8192;
const REASSEMBLY_BUFFER_TRIM = 4096;

// Empty string means "field absent" (GPS block during fix loss) — never 0.
function numOr(s: string | undefined, min: number, max: number): number | null {
  if (s === undefined || s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < min || n > max) return null;
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
  const idx = line.indexOf("Data:");
  if (idx < 0) return null;
  const f = line
    .slice(idx + 5)
    .trim()
    .split(",")
    .map((s) => s.trim());
  if (f.length !== 20) return null;

  if (f[0] !== "0" && f[0] !== "1") return null;
  const vin = cleanVin(f[1]);
  if (!vin) return null;
  // Device placeholder frames (observed 3 in 41k): RPM sentinel 99999 or
  // odometer stuck at exactly 5700.000 km. No real reading — drop whole frame.
  if (Number(f[2]) === 99999 || Number(f[4]) === 5700) return null;
  if (!/^\d{2}\/\d{2}\/\d{2}$/.test(f[9]) || !/^\d{2}:\d{2}:\d{2}$/.test(f[10])) {
    return null;
  }

  const data = emptyIOSiXData();
  data.packetCycleComplete = false;

  data.ignition = f[0] === "1";
  data.vin = vin;
  data.rpm = numOr(f[2], 0, 4000);

  // f3/f13 were swapped in earlier builds: f3 is the ECU road speed and
  // f13 is the GPS ground speed. Both are stored; speedMph prefers GPS
  // (valid engine-off) and falls back to ECU when there is no fix.
  data.ecuSpeedKph = numOr(f[3], 0, 200);
  data.gpsSpeedKph = numOr(f[13], 0, 250);
  const speedKph = data.gpsSpeedKph ?? data.ecuSpeedKph;
  data.speedMph = speedKph !== null ? Math.round(speedKph * KM_TO_MI * 10) / 10 : null;

  // f4/f5 stay in kilometres — the ELD's native unit (5 m quantum).
  data.odometerKm = numOr(f[4], 0, 2_000_000);
  data.tripKm = numOr(f[5], 0, 100_000);

  data.engineHours = numOr(f[6], 0, 200_000);
  // f7 accumulates at exactly 1.000 per engine-hour (idle or driving) and
  // resets on engine start — engine-hours since start, previously misread
  // as cumulative trip fuel.
  data.engineHoursSinceStart = numOr(f[7], 0, 1000);

  data.batteryVoltage = numOr(f[8], 0, 32);

  const [mo, dd, yy] = f[9].split("/");
  data.gpsTimeUtc = `20${yy}-${mo}-${dd}T${f[10]}Z`;

  // GPS block: all-empty means "no fix" — the ECU half is still valid.
  let lat = numOr(f[11], -90, 90);
  let lng = numOr(f[12], -180, 180);
  if (lat === 0 && lng === 0) {
    lat = null;
    lng = null;
  }
  data.lat = lat;
  data.lng = lng;
  const hasFix = lat !== null && lng !== null;

  data.heading = hasFix ? numOr(f[14], 0, 360) : null;
  data.satellites = hasFix ? numOr(f[15], 0, 64) : null;
  data.altitudeM = hasFix ? numOr(f[16], -500, 10000) : null;
  // f17 is HDOP (GPS dilution of precision), NOT a fuel rate — the old
  // ×10/3.785 formula displayed HDOP as a constant ~2-3 gal/h.
  data.hdop = hasFix ? numOr(f[17], 0, 50) : null;

  // f18: device uptime seconds (uint16 wrap). f19 is a constant 349 —
  // carries no information and is never stored.
  data.deviceUptimeS = numOr(f[18], 0, 65535);

  // f15 is the GPS satellite count; the PT30 stream has no transmission data.
  data.currentGear = null;
  // gpsAccuracy: not in the PT30 stream (Expo location supplies accuracy).
  data.gpsAccuracy = null;

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
