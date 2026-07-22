import { Platform, PermissionsAndroid, AppState, AppStateStatus, NativeEventSubscription } from "react-native";
import { BleManager, Device, Subscription, State } from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { IOSiXData, emptyIOSiXData } from "./types";
import { IOSiXCycleBuffer } from "./parser";
import { setSnapshot } from "./store";

// The ELD MAC is no longer the arrival mechanism (native GPS geofences are —
// see transistorsoftTracking.syncStopGeofences). BLE ELD is now a supplementary
// telemetry source only. The target MAC is configurable via AsyncStorage so the
// app is not welded to a single physical truck; the historical hardcoded value
// stays as the default so existing single-truck installs keep working.
export const DEFAULT_IOSIX_MAC = "E0:E2:E6:18:ED:B2";
const ELD_MAC_KEY = "@pingpoint_truck_eld_mac";
let configuredEldMac = DEFAULT_IOSIX_MAC;

export function getEldMac(): string {
  return configuredEldMac;
}

export async function setEldMac(mac: string): Promise<void> {
  const clean = mac.trim().toUpperCase();
  configuredEldMac = clean;
  try {
    await AsyncStorage.setItem(ELD_MAC_KEY, clean);
  } catch {}
}

async function loadEldMac(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(ELD_MAC_KEY);
    if (stored && stored.trim()) configuredEldMac = stored.trim().toUpperCase();
  } catch {}
}

export const IOSIX_SERVICE_UUID = "00000001-0000-1000-8000-00805f9b34fb";
export const IOSIX_CHAR_UUID = "00000001-0000-1000-8000-00805f9b34fb";
export const RECONNECT_INTERVAL_MS = 5000;
// Exponential backoff for scan restarts: 5s, 10s, 20s, ... capped at 5min.
// A fixed 5s restart of an unfiltered scan trips Android's scan throttle
// (max 5 starts per 30s) and the resulting fail-loop can stall the UI thread
// (ANR "PingPoint Driver isn't responding" while the ELD dongle is away).
const RECONNECT_MAX_MS = 5 * 60_000;
// Every Nth attempt scans without a UUID filter as a safety net, in case the
// dongle's advertisement doesn't include IOSIX_SERVICE_UUID.
const UNFILTERED_SCAN_EVERY = 4;
const SCAN_TIMEOUT_MS = 20_000;

// Raw packet logger: capture every BLE notification (base64 wire bytes) and
// stream them to the server continuously so the live telemetry view reflects
// what the truck is sending right now. Behaviour:
//   - buffered in memory and persisted to AsyncStorage (crash safety),
//   - uploaded in small batches every RAW_LOG_UPLOAD_MS while connected,
//   - on upload failure (no signal) the buffer is retained and drains on the
//     next successful tick — i.e. it doubles as an offline queue up to
//     RAW_LOG_MAX entries (~2h at 1 Hz).
// Previously this uploaded only every 2h into a 2000-entry ring, so the server
// (and the /app/telemetry view) saw fresh data at most a couple times an hour
// and lost most samples to ring-trim. Now it streams every few seconds.
const RAW_LOG_KEY = "pp_iosix_raw_log";
// Offline queue depth: ~2h of 1 Hz samples. Only reached when uploads fail;
// under normal streaming the buffer drains every tick and stays near-empty.
const RAW_LOG_MAX = 7200;
const RAW_LOG_FLUSH_MS = 30_000;
// Continuous streaming cadence. Small batches keep the live view current and
// payloads bounded (see RAW_LOG_UPLOAD_BATCH).
const RAW_LOG_UPLOAD_MS = 5_000;
// Cap entries per POST so a drained offline backlog goes up in bounded chunks
// (oldest first) instead of one huge request. At 5 s ticks this drains a
// backlog far faster than 1 Hz fills it.
const RAW_LOG_UPLOAD_BATCH = 500;
// Abort a stuck POST so the in-flight guard can't wedge the stream: okhttp
// will happily hold a socket open for minutes in a dead-LTE spot, and every
// tick skipped behind it is telemetry the server never sees.
const RAW_LOG_UPLOAD_TIMEOUT_MS = 20_000;
// JS-side settlement backstop for the race in uploadRawLog(): abort() only
// helps if the native layer actually delivers a rejection back to JS. Field
// evidence (2026-07-23, 5G→weak LTE) shows a wedged request can swallow the
// abort and never settle — this timer settles the await in pure JS.
const RAW_LOG_UPLOAD_HARD_TIMEOUT_MS = RAW_LOG_UPLOAD_TIMEOUT_MS + 5_000;
// If the in-flight guard is older than this, its owner is presumed dead
// (promise that never settled) and the guard is reclaimed.
const RAW_LOG_UPLOAD_STALE_MS = 60_000;
const RAW_LOG_API_BASE = "https://pingpoint.suverse.io";
// Sent with every raw-log POST so the server can tell which build is talking.
// The July 2026 stall was misdiagnosed for hours because a fixed APK existed
// but the truck was still running the previous one — invisible server-side.
const APP_VERSION: string | null = Constants.expoConfig?.version ?? null;

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
  private reconnectAttempts = 0;
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
  // In-flight guard as a timestamp (when the current upload claimed the
  // queue), not a boolean — see uploadRawLog() for why. The generation
  // counter invalidates a zombie upload after its guard is reclaimed.
  private rawLogUploadStartedAt: number | null = null;
  private rawLogUploadGen = 0;
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
    this.reconnectAttempts = 0;

    await loadEldMac();
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

    // Filtered scans are exempt from most of Android's scan throttling and
    // are far cheaper than a full unfiltered sweep.
    const uuidFilter =
      (this.reconnectAttempts + 1) % UNFILTERED_SCAN_EVERY === 0
        ? null
        : [IOSIX_SERVICE_UUID];

    this.manager.startDeviceScan(uuidFilter, { allowDuplicates: false }, (error, scanned) => {
      if (error) {
        this.scheduleReconnect(this.errMsg(error));
        return;
      }
      if (!scanned) return;
      const id = (scanned.id || "").toUpperCase();
      if (id !== getEldMac().toUpperCase()) return;
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
      this.reconnectAttempts = 0;
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
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_INTERVAL_MS * 2 ** this.reconnectAttempts,
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      if (this.started) this.startScan();
    }, delay);
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
    } else if (next === "active") {
      // Driver is looking at the screen again — restart the search for the
      // dongle right away instead of waiting out a (possibly minutes-long)
      // backoff delay.
      this.reconnectAttempts = 0;
      if (
        this.started &&
        this.manager &&
        !this.device &&
        this.reconnectTimer
      ) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.startScan();
      }
    }
  };

  async uploadRawLog(): Promise<boolean> {
    const token = this.rawLogToken;
    if (!token) return false;
    // One POST at a time. On a slow cell link a request can outlive the 5s
    // tick; two overlapping uploads would each snapshot the same head of the
    // buffer and each slice a batch off on success — the server gets one
    // batch twice and a batch of unsent entries is silently dropped.
    //
    // The guard is a timestamp, not a boolean: the abort timeout only clears
    // the guard if the awaited fetch actually settles, and a request wedged
    // on a dying cell link can swallow abort() and never settle (2026-07-23
    // truck test: uploads stopped permanently at a 5G→weak-LTE transition
    // while /ping on fresh sockets kept working; app restart fixed it). A
    // guard older than RAW_LOG_UPLOAD_STALE_MS is treated as dead and
    // reclaimed. The generation counter keeps such a zombie — should it
    // settle much later after all — from double-slicing the buffer or
    // clearing the new owner's guard.
    const now = Date.now();
    if (
      this.rawLogUploadStartedAt !== null &&
      now - this.rawLogUploadStartedAt < RAW_LOG_UPLOAD_STALE_MS
    ) {
      return false;
    }
    const gen = ++this.rawLogUploadGen;
    this.rawLogUploadStartedAt = now;
    let abortTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      abortTimer = setTimeout(() => controller.abort(), RAW_LOG_UPLOAD_TIMEOUT_MS);
      // Snapshot buffer + persisted merge: we prefer uploading what's in memory
      // since it's the latest; on success we clear both.
      await this.flushRawLogToStorage().catch(() => {});
      // Oldest-first, bounded batch. Any remainder drains on the next tick, so a
      // reconnect after an offline spell catches up over a few seconds without a
      // single oversized POST.
      const snapshot = this.rawLogBuffer.slice(0, RAW_LOG_UPLOAD_BATCH);
      if (snapshot.length === 0) return true;
      const fetchPromise = fetch(`${RAW_LOG_API_BASE}/api/driver/${token}/iosix-raw-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ entries: snapshot, appVersion: APP_VERSION }),
        signal: controller.signal,
      });
      // If the race below abandons this fetch, a late rejection must not
      // surface as an unhandled rejection.
      fetchPromise.catch(() => {});
      // Settlement is guaranteed in pure JS: even if abort() never propagates
      // out of the native request, the hard timer rejects this await.
      const res = await Promise.race([
        fetchPromise,
        new Promise<never>((_, reject) => {
          hardTimer = setTimeout(
            () => reject(new Error("raw_log_upload_timeout")),
            RAW_LOG_UPLOAD_HARD_TIMEOUT_MS,
          );
        }),
      ]);
      // A newer upload reclaimed the guard while this one dawdled — it owns
      // the buffer now; slicing here would drop entries it hasn't sent.
      if (gen !== this.rawLogUploadGen) return false;
      if (!res.ok) return false;
      // Only clear entries we actually sent — new packets may have arrived.
      this.rawLogBuffer = this.rawLogBuffer.slice(snapshot.length);
      this.rawLogDirty = true;
      await this.flushRawLogToStorage().catch(() => {});
      return true;
    } catch {
      // Failed batch stays in rawLogBuffer (only sliced on success) and is
      // retried on the next 5s tick — nothing is dropped here.
      return false;
    } finally {
      if (abortTimer) clearTimeout(abortTimer);
      if (hardTimer) clearTimeout(hardTimer);
      if (gen === this.rawLogUploadGen) this.rawLogUploadStartedAt = null;
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
