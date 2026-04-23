import { IOSiXData, emptyIOSiXData } from "./types";

const DATA_MARKER = /Data:\s*1\s*,/;
export const PACKET_CYCLE_SIZE = 7;

function toNum(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function toNumInRange(raw: string | undefined, min: number, max: number): number | null {
  const n = toNum(raw);
  if (n === null) return null;
  if (n < min || n > max) return null;
  return n;
}

function cleanVin(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.trim().match(/[A-HJ-NPR-Z0-9]{11,17}/i);
  if (!match) return null;
  return match[0].slice(0, 17).toUpperCase();
}

function splitFields(line: string): string[] {
  return line.split(",").map((f) => f.trim());
}

function isLine1(line: string): boolean {
  return DATA_MARKER.test(line);
}

export class IOSiXCycleBuffer {
  private buffer: string[] = [];

  reset(): void {
    this.buffer = [];
  }

  push(line: string): IOSiXData | null {
    if (isLine1(line)) {
      this.buffer = [line];
      return null;
    }
    if (this.buffer.length === 0) {
      return null;
    }
    this.buffer.push(line);
    if (this.buffer.length >= PACKET_CYCLE_SIZE) {
      const lines = this.buffer.slice(0, PACKET_CYCLE_SIZE);
      this.buffer = [];
      return parseCycle(lines);
    }
    return null;
  }
}

export function parseCycle(lines: string[]): IOSiXData {
  const data = emptyIOSiXData();
  data.packetCycleComplete = false;

  if (lines.length < PACKET_CYCLE_SIZE) return data;

  const l1 = splitFields(lines[0]);
  const l2 = splitFields(lines[1]);
  const l3 = splitFields(lines[2]);
  const l4 = splitFields(lines[3]);
  const l5 = splitFields(lines[4]);
  const l6 = splitFields(lines[5]);
  const l7 = splitFields(lines[6]);

  data.vin = cleanVin(l1[1]);

  data.rpm = toNumInRange(l2[1], 0, 4000);
  data.speedMph = toNumInRange(l2[2], 0, 120);

  data.odometerMiles = toNumInRange(l3[1], 0, 2_000_000);
  data.engineHours = toNumInRange(l3[2], 0, 200_000);

  data.fuelRateGph = toNumInRange(l4[1], 0, 50);
  data.batteryVoltage = toNumInRange(l4[2], 0, 32);
  const datePart = (l4[3] ?? "").trim();

  const timePart = (l5[1] ?? "").trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(timePart) && datePart) {
    const dateMatch = datePart.match(/^(\d{2})\/(\d{2})\/?(\d{0,4})/);
    if (dateMatch) {
      const mm = dateMatch[1];
      const dd = dateMatch[2];
      const yearFrag = dateMatch[3];
      let yyyy: string | null = yearFrag.length === 4 ? yearFrag : null;
      if (!yyyy) {
        const yearFromL5 = (l5[0] ?? "").match(/(\d{4})$/);
        if (yearFromL5) yyyy = yearFromL5[1];
      }
      if (yyyy) {
        data.gpsTimeUtc = `${yyyy}-${mm}-${dd}T${timePart}Z`;
      }
    }
  }

  const latMainRaw = (l5[2] ?? "").trim();
  const latDecRaw = (l6[0] ?? "").replace(/^[^0-9]*/, "").trim();
  if (latMainRaw && /^-?\d+(\.\d+)?$/.test(latMainRaw)) {
    const combined = latDecRaw ? `${latMainRaw}${latDecRaw}` : latMainRaw;
    const n = Number(combined);
    if (Number.isFinite(n) && n >= -90 && n <= 90) {
      data.lat = n;
    }
  }

  data.lng = toNumInRange(l6[1], -180, 180);
  const sat1 = toNumInRange(l6[2], 0, 64);
  data.heading = toNumInRange(l6[3], 0, 360);

  const sat2 = toNumInRange(l7[1], 0, 64);
  data.altitudeM = toNumInRange(l7[2], -500, 10000);
  data.gpsAccuracy = toNumInRange(l7[3], 0, 1000);

  data.satellites = sat2 ?? sat1;

  data.packetCycleComplete = true;
  data.lastUpdated = Date.now();
  return data;
}
