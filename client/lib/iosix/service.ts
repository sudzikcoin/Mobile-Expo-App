import { Platform, PermissionsAndroid, AppState, AppStateStatus, NativeEventSubscription } from "react-native";
import { BleManager, Device, Subscription, State } from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { IOSiXData, emptyIOSiXData } from "./types";
import { IOSiXCycleBuffer } from "./parser";
import { setSnapshot } from "./store";

export const IOSIX_MAC = "E0:E2:E6:18:ED:B2";
export const IOSIX_SERVICE_UUID = "00000001-0000-1000-8000-00805f9b34fb";
export const IOSIX_CHAR_UUID = "00000001-0000-1000-8000-00805f9b34fb";
export const RECONNECT_INTERVAL_MS = 5000;
const SCAN_TIMEOUT_MS = 20_000;

// Raw packet logger: capture every BLE notification (base64 wire bytes)
// to AsyncStorage so we can upload for offline diagnostics. Ring-buffered
// at RAW_LOG_MAX entries; flushed on a timer (in-memory → AsyncStorage)
// and uploaded every RAW_LOG_UPLOAD_MS and whenever app backgrounds.
const RAW_LOG_KEY = "pp_iosix_raw_log";
const RAW_LOG_MAX = 2000;
const RAW_LOG_FLUSH_MS = 30_000;
const RAW_LOG_UPLOAD_MS = 2 * 60 * 60 * 1000;
const RAW_LOG_API_BASE = "https://pingpoint.suverse.io";

interface RawLogEntry { timestamp: number; raw: string; }

// Auto arrive/depart geofence thresholds.
const AUTO_STOP_RADIUS_M = 500;
const AUTO_STOP_DWELL_MS = 60_000;
const AUTO_MOVING_SPEED_MPH = 5;

export interface AutoADStop {
  id: string;
  type: "PICKUP" | "DELIVERY";
  lat: number;
  lng: number;
  arrivedAt?: string | null;
  departedAt?: string | null;
}

export interface AutoADConfig {
  token: string | null;
  stops: AutoADStop[];
  onArrive: (stopId: string) => Promise<void> | void;
  onDepart: (stopId: string) => Promise<void> | void;
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export type ConnectionStatus = "idle" | "scanning" | "connecting" | "connected" | "error";

export interface ServiceSnapshot {
  status: ConnectionStatus;
  telemetry: IOSiXData;
  error: string | null;
  lastRssi: number | null;
}

type Listener = (s: ServiceSnapshot) => void;

function base64ToAscii(b64: string): string {
  const g: { atob?: (s: string) => string } = globalThis as unknown as { atob?: (s: string) => string };
  if (typeof g.atob === "function") {
    try {
      return g.atob(b64);
    } catch {}
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = b64.replace(/=+$/, "").replace(/[^A-Za-z0-9+/]/g, "");
  let out = "";
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buf = (buf << 6) | chars.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buf >> bits) & 0xff);
    }
  }
  return out;
}

class IOSiXService {
  private manager: BleManager | null = null;
  private device: Device | null = null;
  private monitorSub: Subscription | null = null;
  private disconnectSub: Subscription | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private buffer = new IOSiXCycleBuffer();
  private state: ServiceSnapshot = {
    status: "idle",
    telemetry: emptyIOSiXData(),
    error: null,
    lastRssi: null,
  };
  private listeners = new Set<Listener>();
  private started = false;

  // Raw packet log state.
  private rawLogBuffer: RawLogEntry[] = [];
  private rawLogDirty = false;
  private rawLogFlushTimer: ReturnType<typeof setInterval> | null = null;
  private rawLogUploadTimer: ReturnType<typeof setInterval> | null = null;
  private rawLogToken: string | null = null;
  private appStateSub: NativeEventSubscription | null = null;

  // Auto arrive/depart state.
  private autoAD: AutoADConfig | null = null;
  private stoppedSinceMs: number | null = null;
  private wasMoving = false;
  private autoTriggered = new Set<string>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    this.listeners.forEach((l) => {
      try {
        l(this.state);
      } catch {}
    });
  }

  private update(patch: Partial<ServiceSnapshot>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    await this.loadRawLogFromStorage();
    this.startRawLogTimers();
    this.appStateSub = AppState.addEventListener("change", this.handleAppStateChange);

    try {
      const granted = await this.requestPermissions();
      if (!granted) {
        this.update({ status: "error", error: "ble_permission_denied" });
        this.started = false;
        return;
      }
      this.manager = new BleManager();
      this.waitForPoweredOnThenScan();
    } catch (e) {
      this.update({ status: "error", error: this.errMsg(e) });
      this.started = false;
    }
  }

  async stop(): Promise<void> {
    this.started = false;
    this.clearTimers();
    this.stopRawLogTimers();
    try {
      this.appStateSub?.remove();
    } catch {}
    this.appStateSub = null;
    try {
      this.monitorSub?.remove();
      this.disconnectSub?.remove();
    } catch {}
    this.monitorSub = null;
    this.disconnectSub = null;
    try {
      if (this.device) await this.device.cancelConnection();
    } catch {}
    this.device = null;
    try {
      this.manager?.stopDeviceScan();
      this.manager?.destroy();
    } catch {}
    this.manager = null;
    // Best-effort flush before shutdown so buffered entries survive.
    await this.flushRawLogToStorage().catch(() => {});
    this.update({ status: "idle", error: null });
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.reconnectTimer = null;
    this.scanTimer = null;
  }

  private waitForPoweredOnThenScan(): void {
    if (!this.manager) return;
    const sub = this.manager.onStateChange((st) => {
      if (st === State.PoweredOn) {
        sub.remove();
        this.startScan();
      } else if (st === State.Unsupported || st === State.Unauthorized) {
        sub.remove();
        this.update({ status: "error", error: `ble_${st.toLowerCase()}` });
      }
    }, true);
  }

  private startScan(): void {
    if (!this.manager || !this.started) return;
    this.update({ status: "scanning", error: null });

    this.scanTimer = setTimeout(() => {
      try {
        this.manager?.stopDeviceScan();
      } catch {}
      if (this.state.status === "scanning") {
        this.scheduleReconnect("scan_timeout");
      }
    }, SCAN_TIMEOUT_MS);

    this.manager.startDeviceScan(null, { allowDuplicates: false }, (error, scanned) => {
      if (error) {
        this.scheduleReconnect(this.errMsg(error));
        return;
      }
      if (!scanned) return;
      const id = (scanned.id || "").toUpperCase();
      if (id !== IOSIX_MAC.toUpperCase()) return;
      try {
        this.manager?.stopDeviceScan();
      } catch {}
      if (this.scanTimer) {
        clearTimeout(this.scanTimer);
        this.scanTimer = null;
      }
      void this.connectTo(scanned);
    });
  }

  private async connectTo(dev: Device): Promise<void> {
    if (!this.manager || !this.started) return;
    this.update({ status: "connecting", error: null, lastRssi: dev.rssi ?? null });
    try {
      const connected = await dev.connect({ autoConnect: false });
      await connected.discoverAllServicesAndCharacteristics();
      this.device = connected;

      this.disconnectSub = connected.onDisconnected(() => {
        this.device = null;
        try {
          this.monitorSub?.remove();
        } catch {}
        this.monitorSub = null;
        if (this.started) this.scheduleReconnect("disconnected");
      });

      this.monitorSub = connected.monitorCharacteristicForService(
        IOSIX_SERVICE_UUID,
        IOSIX_CHAR_UUID,
        (err, char) => {
          if (err) {
            this.scheduleReconnect(this.errMsg(err));
            return;
          }
          if (!char?.value) return;
          // Keep the original base64 for raw-log upload — the server-side
          // reassembly expects the unmodified BLE notify bytes.
          this.appendRawLog(char.value);
          try {
            const raw = base64ToAscii(char.value);
            // First byte of every BLE notify is a 1-byte sequence counter
            // (server strips identically in ingestIosixPingsFromRaw).
            const stripped = raw.length > 0 ? raw.slice(1) : raw;
            this.ingestFrame(stripped);
          } catch {}
        }
      );
      this.update({ status: "connected", error: null });
    } catch (e) {
      this.scheduleReconnect(this.errMsg(e));
    }
  }

  private ingestFrame(raw: string): void {
    // Pass the raw fragment through without splitting on CRLF — the parser
    // is now a streaming buffer that needs to see \r\n boundaries to know
    // when a packet is complete.
    const cycle = this.buffer.push(raw);
    if (cycle) {
      cycle.connected = true;
      cycle.signalDbm = this.state.lastRssi;
      this.update({ telemetry: cycle });
      setSnapshot(cycle);
      this.evaluateAutoArriveDepart(cycle);
    }
  }

  private scheduleReconnect(reason: string): void {
    if (!this.started) return;
    this.update({ status: "scanning", error: reason });
    try {
      this.monitorSub?.remove();
      this.disconnectSub?.remove();
    } catch {}
    this.monitorSub = null;
    this.disconnectSub = null;
    this.device = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.started) this.startScan();
    }, RECONNECT_INTERVAL_MS);
  }

  private errMsg(e: unknown): string {
    if (!e) return "unknown";
    if (typeof e === "string") return e;
    if (typeof e === "object" && e !== null && "message" in e) {
      const m = (e as { message?: unknown }).message;
      return typeof m === "string" ? m : "unknown";
    }
    return "unknown";
  }

  // ---------------- Raw packet log ----------------

  setRawLogToken(token: string | null): void {
    this.rawLogToken = token;
  }

  private appendRawLog(rawB64: string): void {
    this.rawLogBuffer.push({ timestamp: Date.now(), raw: rawB64 });
    if (this.rawLogBuffer.length > RAW_LOG_MAX) {
      // Trim oldest — keep newest RAW_LOG_MAX.
      this.rawLogBuffer.splice(0, this.rawLogBuffer.length - RAW_LOG_MAX);
    }
    this.rawLogDirty = true;
  }

  private async loadRawLogFromStorage(): Promise<void> {
    try {
      const s = await AsyncStorage.getItem(RAW_LOG_KEY);
      if (!s) return;
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        this.rawLogBuffer = parsed.slice(-RAW_LOG_MAX);
      }
    } catch {}
  }

  private async flushRawLogToStorage(): Promise<void> {
    if (!this.rawLogDirty) return;
    try {
      await AsyncStorage.setItem(RAW_LOG_KEY, JSON.stringify(this.rawLogBuffer));
      this.rawLogDirty = false;
    } catch {}
  }

  private startRawLogTimers(): void {
    if (!this.rawLogFlushTimer) {
      this.rawLogFlushTimer = setInterval(() => {
        void this.flushRawLogToStorage();
      }, RAW_LOG_FLUSH_MS);
    }
    if (!this.rawLogUploadTimer) {
      this.rawLogUploadTimer = setInterval(() => {
        void this.uploadRawLog();
      }, RAW_LOG_UPLOAD_MS);
    }
  }

  private stopRawLogTimers(): void {
    if (this.rawLogFlushTimer) clearInterval(this.rawLogFlushTimer);
    if (this.rawLogUploadTimer) clearInterval(this.rawLogUploadTimer);
    this.rawLogFlushTimer = null;
    this.rawLogUploadTimer = null;
  }

  private handleAppStateChange = (next: AppStateStatus): void => {
    if (next === "background" || next === "inactive") {
      void (async () => {
        await this.flushRawLogToStorage().catch(() => {});
        await this.uploadRawLog().catch(() => {});
      })();
    }
  };

  async uploadRawLog(): Promise<boolean> {
    const token = this.rawLogToken;
    if (!token) return false;
    // Snapshot buffer + persisted merge: we prefer uploading what's in memory
    // since it's the latest; on success we clear both.
    await this.flushRawLogToStorage().catch(() => {});
    const snapshot = this.rawLogBuffer.slice();
    if (snapshot.length === 0) return true;
    try {
      const res = await fetch(`${RAW_LOG_API_BASE}/api/driver/${token}/iosix-raw-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ entries: snapshot }),
      });
      if (!res.ok) return false;
      // Only clear entries we actually sent — new packets may have arrived.
      const sentCount = snapshot.length;
      this.rawLogBuffer = this.rawLogBuffer.slice(sentCount);
      this.rawLogDirty = true;
      await this.flushRawLogToStorage().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  // ---------------- Auto arrive/depart ----------------

  configureAutoArriveDepart(config: AutoADConfig | null): void {
    this.autoAD = config;
    this.stoppedSinceMs = null;
    this.wasMoving = false;
    this.autoTriggered.clear();
    if (config?.token) this.setRawLogToken(config.token);
  }

  private evaluateAutoArriveDepart(cycle: IOSiXData): void {
    const cfg = this.autoAD;
    if (!cfg || !cfg.stops.length) return;
    const lat = cycle.lat;
    const lng = cycle.lng;
    const speed = cycle.speedMph;
    if (lat == null || lng == null || speed == null) return;

    const now = Date.now();
    const moving = speed > AUTO_MOVING_SPEED_MPH;

    if (moving) {
      // Depart trigger: we were stopped at a pickup and now we're moving.
      if (this.wasMoving === false && this.stoppedSinceMs !== null) {
        const pickupInRange = cfg.stops.find(
          (s) => s.type === "PICKUP"
            && s.arrivedAt
            && !s.departedAt
            && !this.autoTriggered.has(`dep:${s.id}`)
            && haversineM(lat, lng, s.lat, s.lng) <= AUTO_STOP_RADIUS_M,
        );
        if (pickupInRange) {
          this.autoTriggered.add(`dep:${pickupInRange.id}`);
          void Promise.resolve(cfg.onDepart(pickupInRange.id)).catch(() => {});
        }
      }
      this.wasMoving = true;
      this.stoppedSinceMs = null;
    } else {
      if (this.stoppedSinceMs === null) this.stoppedSinceMs = now;
      if (this.wasMoving && now - this.stoppedSinceMs >= AUTO_STOP_DWELL_MS) {
        const stopInRange = cfg.stops.find(
          (s) => !s.arrivedAt
            && !this.autoTriggered.has(`arr:${s.id}`)
            && haversineM(lat, lng, s.lat, s.lng) <= AUTO_STOP_RADIUS_M,
        );
        if (stopInRange) {
          this.autoTriggered.add(`arr:${stopInRange.id}`);
          void Promise.resolve(cfg.onArrive(stopInRange.id)).catch(() => {});
        }
      }
    }
  }

  private async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== "android") return true;
    const apiLevel = typeof Platform.Version === "number" ? Platform.Version : parseInt(String(Platform.Version), 10);
    try {
      if (apiLevel >= 31) {
        const res = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        return (
          res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
          res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
        );
      }
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      return r === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }
}

let singleton: IOSiXService | null = null;

export function getIOSiXService(): IOSiXService {
  if (!singleton) singleton = new IOSiXService();
  return singleton;
}
