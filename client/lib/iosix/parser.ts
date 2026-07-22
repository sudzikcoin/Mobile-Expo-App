import { IOSiXData, emptyIOSiXData } from "./types";

// IOSiX PT30 BLE wire format: a CRLF-terminated CSV line of 20 fields
// starting with "Data: ". BLE notify fragments carry a one-byte sequence
// counter that the service layer strips before feeding this parser.
//
// IMPORTANT: this regex must stay in sync with the server-side parser at
// /root/PingPoint/server/routes.ts (IOSIX_LINE_RE). When fields change in
// firmware, update both copies together.
//
// Field map (verified against raw BLE captures, logs/iosix 2026-07-21):
//   m[1]  ignition 0/1 (0 = key off; GPS/voltage remain valid)
//   m[2]  VIN            m[3]  engine RPM
//   m[4]  GPS speed kph  m[5]  odometer km      m[6]  trip km (both → mi)
//   m[7]  total engine hours (0.05 h quantum)
//   m[8]  engine-hours since engine start (0.05 h; NOT fuel — the stream
//         carries no fuel measurement at all)
//   m[9]  battery V      m[10] date MM/DD/YY    m[11] time HH:MM:SS UTC
//   m[12] lat            m[13] lng
//   m[14] wheel speed kph   m[15] heading 0-358°   m[16] satellites
//   m[17] altitude m     m[18] HDOP (was misparsed as fuel rate)
//   m[19] session counter (~1Hz)                m[20] packet flag (349)
const IOSIX_LINE_RE =
  /Data:\s*([01]),([A-Z0-9]{1,32}),(-?\d+),(-?\d+(?:\.\d+)?),([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+),(\d{2}\/\d{2}\/\d{2}),(\d{2}:\d{2}:\d{2}),(-?\d+\.\d+),(-?\d+\.\d+),(-?\d+),(-?\d+),(-?\d+),(\d+),([\d.]+),(\d+),(\d+)/;

const KM_TO_MI = 0.621371;
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

  data.ignition = m[1] === "1";

  data.vin = cleanVin(m[2]);

  // f2 is a narrow-band integer often correlating with engine RPM at idle.
  // Server treats it as unreliable; mobile keeps reading it for dashboard
  // parity until a better source is wired up.
  data.rpm = clamp(num(m[3]), 0, 4000);

  const kph = num(m[4]);
  data.speedMph = kph !== null ? Math.round(kph * KM_TO_MI * 10) / 10 : null;

  // f4/f5 are kilometers on the wire (verified: sum of f4 deltas matches the
  // GPS path integral 1:1, not 1:0.62) — convert to the miles the fields and
  // DB columns are named for.
  const odoKm = clamp(num(m[5]), 0, 2_000_000);
  data.odometerMiles = odoKm !== null ? Math.round(odoKm * KM_TO_MI * 10) / 10 : null;
  const tripKm = clamp(num(m[6]), 0, 100_000);
  data.tripMiles = tripKm !== null ? Math.round(tripKm * KM_TO_MI * 10) / 10 : null;
  data.engineHours = clamp(num(m[7]), 0, 200_000);

  // f7 accumulates at exactly 1.000 per engine-hour (idle or driving) and
  // resets on engine start — engine-hours since start, previously misread
  // as cumulative trip fuel.
  data.engineHoursSinceStart = clamp(num(m[8]), 0, 1000);

  data.batteryVoltage = clamp(num(m[9]), 0, VOLTAGE_MAX);

  if (m[10] && m[11]) {
    const [mo, dd, yy] = m[10].split("/");
    data.gpsTimeUtc = `20${yy}-${mo}-${dd}T${m[11]}Z`;
  }

  data.lat = clamp(num(m[12]), -90, 90);
  data.lng = clamp(num(m[13]), -180, 180);

  // m[14] wheel speed kph: not surfaced — UI uses GPS speed (m[4]).
  data.heading = clamp(num(m[15]), 0, 360);
  // m[16] is the GPS satellite count, not a gear (the 0-10 clamp used to
  // mask that). The PT30 stream has no transmission data.
  data.currentGear = null;

  // f17 is HDOP (GPS dilution of precision), NOT a fuel rate — the old
  // ×10/3.785 formula displayed HDOP as a constant ~2-3 gal/h.
  data.hdop = clamp(num(m[18]), 0, 50);

  data.satellites = clamp(num(m[16]), 0, 32);
  data.altitudeM = clamp(num(m[17]), -500, 10000);
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
