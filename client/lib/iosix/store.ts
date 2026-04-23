import AsyncStorage from "@react-native-async-storage/async-storage";
import { IOSiXData } from "./types";

const STORAGE_KEY = "pp_iosix_latest";
const STALE_MS = 30_000;

export interface IOSiXSnapshot {
  data: IOSiXData;
  storedAt: number;
}

let memSnapshot: IOSiXSnapshot | null = null;

export function setSnapshot(data: IOSiXData): void {
  const snap: IOSiXSnapshot = { data, storedAt: Date.now() };
  memSnapshot = snap;
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snap)).catch(() => {});
}

export async function getSnapshot(): Promise<IOSiXSnapshot | null> {
  if (memSnapshot) return memSnapshot;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IOSiXSnapshot;
    return parsed;
  } catch {
    return null;
  }
}

export async function getFreshTelemetry(): Promise<IOSiXData | null> {
  const snap = await getSnapshot();
  if (!snap) return null;
  if (Date.now() - snap.storedAt > STALE_MS) return null;
  return snap.data;
}

export async function clearSnapshot(): Promise<void> {
  memSnapshot = null;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
}
