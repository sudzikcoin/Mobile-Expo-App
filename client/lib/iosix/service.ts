import { Platform, PermissionsAndroid, AppState, AppStateStatus, NativeEventSubscription } from "react-native";
import { BleManager, Device, Subscription, State } from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { IOSiXData, emptyIOSiXData } from "./types";
import { IOSiXCycleBuffer } from "./parser";
import { setSnapshot } from "./store";
import {
  startTelemetryForegroundService,
  stopTelemetryForegroundService,
  addTelemetryTickListener,
} from "../../../modules/pingpoint-telemetry-service";

// The ELD MAC is no longer the arrival mechanism (native GPS geofences are —
// see transistorsoftTracking.syncStopGeofences). BLE ELD is now a supplementary
// telemetry source only. The target MAC is configurable via AsyncStorage so the
// app is not welded to a single physical truck; the historical hardcoded value
// stays as the default so existing single-truck installs keep working.
export const DEFAULT_IOSIX_MAC = "E0:E2:E6:18:ED:B2";
const ELD_MAC_KEY = "@pingpoint_truck_eld_mac";
let configuredEldMac = DEFAULT_IOSIX_MAC;

// iOS: Core Bluetooth never exposes MAC addresses — device.id is a per-device
// random UUID Apple assigns to the peripheral, so the MAC-based matching above
// cannot work there. Instead we match by advertised service UUID (and, as a
// TODO-verify fallback, by local name), then persist the UUID iOS handed us so
// later sessions can match the exact peripheral directly.
// TODO(iOS/device): confirm on a real iPhone + dongle that the IOSiX
// advertisement actually carries IOSIX_SERVICE_UUID (the Android unfiltered-
// scan safety net exists because this was never certain) and capture its
// advertised local name; until then IOS_ELD_NAME_HINT is a guess.
const IOS_ELD_UUID_KEY = "@pingpoint_truck_eld_ios_uuid";
const IOS_ELD_NAME_HINT = "iosix";
let knownIosEldUuid: string | null = null;

async function loadIosEldUuid(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(IOS_ELD_UUID_KEY);
    if (stored && stored.trim()) knownIosEldUuid = stored.trim();
  } catch {}
}

function rememberIosEldUuid(uuid: string): void {
  knownIosEldUuid = uuid;
  void AsyncStorage.setItem(IOS_ELD_UUID_KEY, uuid).catch(() => {});
}

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
// tick skipped behind it is telemetry the server never sees. Applied as
// xhr.timeout, which Android enforces natively (OkHttp callTimeout) — it
// fires even while JS timers are frozen in the background.
const RAW_LOG_UPLOAD_TIMEOUT_MS = 20_000;
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
  // The in-flight request, so a stale-guard reclaim can kill the zombie's
  // socket instead of leaving OkHttp streaming into a request nobody owns.
  private uploadXhr: XMLHttpRequest | null = null;
  private rawLogToken: string | null = null;
  private appStateSub: NativeEventSubscription | null = null;

  // Background execution. RN timers are driven by Choreographer frame
  // callbacks, which Android stops delivering while the host activity is
  // paused — every setInterval/setTimeout above freezes the moment the driver
  // switches apps. The native module provides (a) a connectedDevice
  // foreground service that keeps the process out of the cached-app freezer
  // so BLE notifications keep flowing, and (b) a Handler-driven 5s tick that
  // is immune to the pause. onNativeTick() re-runs whichever of the frozen
  // timers is overdue; in the foreground it is a no-op because the real
  // timers fire on schedule. Deadlines for the one-shot timers are mirrored
  // in wall-clock fields so the tick can fire them late.
  private tickSub: { remove: () => void } | null = null;
  private fgsStarted = false;
  private lastFlushAt = 0;
  private lastUploadAttemptAt = 0;
  private reconnectDueAt: number | null = null;
  private scanDeadlineAt: number | null = null;

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
    if (Platform.OS === "ios") await loadIosEldUuid();
    await this.loadRawLogFromStorage();
    this.startRawLogTimers();
    this.appStateSub = AppState.addEventListener("change", this.handleAppStateChange);
    this.tickSub = addTelemetryTickListener(() => this.onNativeTick());

    try {
      const granted = await this.requestPermissions();
      if (!granted) {
        this.update({ status: "error", error: "ble_permission_denied" });
        this.started = false;
        return;
      }
      // iOS: opt into Core Bluetooth state restoration. If iOS terminates the
      // app while a peripheral connection (or pending connect) exists, a BLE
      // event relaunches the app in the background and hands the restored
      // peripherals to this callback. That relaunch path only re-establishes
      // the native BLE session — JS must restart the pipeline, which start()
      // does when DriverProvider mounts in the relaunched app.
      // TODO(iOS/device): verify relaunch-on-BLE-event end to end on a real
      // device (Xcode console, app force-backgrounded then killed by memory
      // pressure — NOT swipe-killed; iOS never restores swipe-killed apps).
      this.manager =
        Platform.OS === "ios"
          ? new BleManager({
              restoreStateIdentifier: "pingpoint-iosix-ble",
              restoreStateFunction: () => {
                // Connection recovery is handled by the normal scan/connect
                // loop once start() runs; nothing to do with the restored
                // peripheral list itself.
              },
            })
          : new BleManager();
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
      this.tickSub?.remove();
    } catch {}
    this.tickSub = null;
    stopTelemetryForegroundService();
    this.fgsStarted = false;
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
    this.reconnectDueAt = null;
    this.scanDeadlineAt = null;
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

    this.scanDeadlineAt = Date.now() + SCAN_TIMEOUT_MS;
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null;
      this.scanDeadlineAt = null;
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
      if (!this.isTargetDevice(scanned)) return;
      if (Platform.OS === "ios") rememberIosEldUuid(scanned.id);
      try {
        this.manager?.stopDeviceScan();
      } catch {}
      if (this.scanTimer) {
        clearTimeout(this.scanTimer);
        this.scanTimer = null;
      }
      this.scanDeadlineAt = null;
      void this.connectTo(scanned);
    });
  }

  // Android identifies the dongle by MAC (device.id IS the MAC there). iOS
  // hides MACs, so match: (1) the peripheral UUID we saw in a previous
  // session, else (2) the IOSiX service UUID in the advertisement, else
  // (3) a local-name hint (see IOS_ELD_NAME_HINT TODO). First iOS match wins
  // and its UUID is persisted by the scan callback for future sessions.
  private isTargetDevice(scanned: Device): boolean {
    const id = (scanned.id || "").toUpperCase();
    if (Platform.OS !== "ios") {
      return id === getEldMac().toUpperCase();
    }
    if (knownIosEldUuid) return id === knownIosEldUuid.toUpperCase();
    const advertised = (scanned.serviceUUIDs || []).map((u) => u.toLowerCase());
    if (advertised.includes(IOSIX_SERVICE_UUID.toLowerCase())) return true;
    const name = (scanned.localName || scanned.name || "").toLowerCase();
    return name.includes(IOS_ELD_NAME_HINT);
  }

  private async connectTo(dev: Device): Promise<void> {
    if (!this.manager || !this.started) return;
    this.update({ status: "connecting", error: null, lastRssi: dev.rssi ?? null });
    try {
      const connected = await dev.connect({ autoConnect: false });
      await this.attachConnectedDevice(connected);
    } catch (e) {
      this.scheduleReconnect(this.errMsg(e));
    }
  }

  // Post-connect setup shared by the scan->connect path (both platforms) and
  // the iOS pending-connect path. Throws on failure; callers route the error
  // into scheduleReconnect.
  private async attachConnectedDevice(connected: Device): Promise<void> {
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
        // iOS has no native 5s tick (the foreground-service module is
        // Android-only) and JS timers freeze in background there too. But
        // every BLE notification wakes the app for a few seconds, so this
        // 1 Hz callback IS the background heartbeat: onNativeTick() is
        // self-throttled by the per-timer deadlines, so calling it per
        // notification keeps the upload/flush cadence without extra work in
        // the foreground.
        if (Platform.OS === "ios") this.onNativeTick();
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
    this.ensureForegroundService();
  }

  // iOS-only reconnect mechanism. In the background JS timers freeze, and an
  // unfiltered scan returns nothing at all — so the timer-driven scan loop
  // cannot re-find the dongle until the app is foregrounded. Core Bluetooth's
  // answer is a connect request with no timeout: it stays pending natively
  // (survives screen-off, and with state restoration even app termination)
  // and completes the moment the peripheral reappears. Armed from
  // scheduleReconnect using the peripheral UUID persisted on first contact.
  // TODO(iOS/device): verify on hardware that a pending connect issued during
  // the ~10s of runtime after onDisconnected survives suspension and
  // completes when the truck/dongle powers back up.
  private iosPendingConnect = false;
  private iosEnsurePendingConnect(): void {
    if (Platform.OS !== "ios" || this.iosPendingConnect) return;
    if (!this.started || !this.manager || this.device) return;
    const uuid = knownIosEldUuid;
    if (!uuid) return;
    this.iosPendingConnect = true;
    this.manager
      .connectToDevice(uuid) // no timeout: pending until the dongle reappears
      .then(async (connected) => {
        this.iosPendingConnect = false;
        if (!this.started || this.device) {
          try {
            await connected.cancelConnection();
          } catch {}
          return;
        }
        this.clearTimers();
        try {
          this.manager?.stopDeviceScan();
        } catch {}
        try {
          await this.attachConnectedDevice(connected);
        } catch (e) {
          this.scheduleReconnect(this.errMsg(e));
        }
      })
      .catch(() => {
        // Unknown UUID / Bluetooth off / cancelled — the scan path stays the
        // fallback; next scheduleReconnect re-arms this.
        this.iosPendingConnect = false;
      });
  }

  // Start the connectedDevice foreground service once we actually talk to a
  // dongle (drivers without one never see the extra notification). It stays
  // up across disconnects until stop() so the process survives backgrounded
  // reconnect cycles; startForegroundService is only legal from the
  // foreground on Android 12+, hence the retry on the next "active".
  private ensureForegroundService(): void {
    if (Platform.OS !== "android" || this.fgsStarted) return;
    this.fgsStarted = startTelemetryForegroundService(
      "PingPoint tracking active",
      "Streaming truck telemetry",
    );
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
    this.reconnectDueAt = Date.now() + delay;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDueAt = null;
      if (this.started) this.startScan();
    }, delay);
    // The timer above only fires while JS is running (foreground, or Android
    // background under the FGS tick). On iOS the pending connect is what
    // actually recovers the link in background — arm it alongside.
    this.iosEnsurePendingConnect();
  }

  // Driven by the native 5s tick (see field comments). Each branch acts only
  // when the corresponding timer is overdue, so cadence is unchanged and in
  // the foreground — where the real timers fire on time — this is a no-op.
  private onNativeTick(): void {
    if (!this.started) return;
    const now = Date.now();
    if (now - this.lastFlushAt >= RAW_LOG_FLUSH_MS) {
      void this.flushRawLogToStorage();
    }
    if (now - this.lastUploadAttemptAt >= RAW_LOG_UPLOAD_MS) {
      void this.uploadRawLog();
    }
    if (
      this.reconnectTimer &&
      this.reconnectDueAt !== null &&
      now >= this.reconnectDueAt
    ) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.reconnectDueAt = null;
      this.startScan();
    }
    if (
      this.scanTimer &&
      this.scanDeadlineAt !== null &&
      now >= this.scanDeadlineAt
    ) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
      this.scanDeadlineAt = null;
      try {
        this.manager?.stopDeviceScan();
      } catch {}
      if (this.state.status === "scanning") {
        this.scheduleReconnect("scan_timeout");
      }
    }
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
    this.lastFlushAt = Date.now();
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
        this.reconnectDueAt = null;
        this.startScan();
      }
      // A foreground-service start that was rejected (or the module racing
      // app startup) gets another chance now that we're legally foreground.
      if (this.device) this.ensureForegroundService();
    }
  };

  // POST one batch over a bare XMLHttpRequest instead of fetch(). fetch in
  // React Native is the whatwg-fetch polyfill, and it resolves its promise
  // inside setTimeout(0) — for onload, onerror, ontimeout AND onabort. JS
  // timers stop the moment the host activity pauses (JavaTimerManager
  // .onHostPause clears the Choreographer frame callback), so a backgrounded
  // upload could complete server-side in 100 ms and still never settle in JS
  // (2026-07-23 field test: guard freed only by the 60 s stale reclaim, the
  // unsliced batch re-sent every reclaim — the server logged the same 500
  // entries four times in a row). XHR has neither problem: React Native
  // dispatches load/error/timeout synchronously from the native completion
  // event, and xhr.timeout is enforced natively by OkHttp — no JS timer
  // anywhere in the settle path.
  private postRawLogBatch(token: string, body: string): Promise<{ ok: boolean }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.uploadXhr = xhr;
      xhr.open("POST", `${RAW_LOG_API_BASE}/api/driver/${token}/iosix-raw-log`);
      xhr.timeout = RAW_LOG_UPLOAD_TIMEOUT_MS;
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Accept", "application/json");
      xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300 });
      xhr.onerror = () => reject(new Error("raw_log_upload_network_error"));
      xhr.ontimeout = () => reject(new Error("raw_log_upload_timeout"));
      xhr.onabort = () => reject(new Error("raw_log_upload_aborted"));
      xhr.send(body);
    });
  }

  async uploadRawLog(): Promise<boolean> {
    this.lastUploadAttemptAt = Date.now();
    const token = this.rawLogToken;
    if (!token) return false;
    // One POST at a time. On a slow cell link a request can outlive the 5s
    // tick; two overlapping uploads would each snapshot the same head of the
    // buffer and each slice a batch off on success — the server gets one
    // batch twice and a batch of unsent entries is silently dropped.
    //
    // The guard is a timestamp, not a boolean: settlement is normally
    // guaranteed by the native xhr.timeout, but if a request somehow never
    // settles anyway, a guard older than RAW_LOG_UPLOAD_STALE_MS is treated
    // as dead and reclaimed. The generation counter keeps such a zombie —
    // should it settle much later after all — from double-slicing the buffer
    // or clearing the new owner's guard.
    const now = Date.now();
    if (
      this.rawLogUploadStartedAt !== null &&
      now - this.rawLogUploadStartedAt < RAW_LOG_UPLOAD_STALE_MS
    ) {
      return false;
    }
    if (this.rawLogUploadStartedAt !== null && this.uploadXhr) {
      // Reclaiming a stale guard: kill the zombie's socket as well. Its
      // handlers are gen-checked, so this can't clobber the new owner.
      try {
        this.uploadXhr.abort();
      } catch {}
    }
    const gen = ++this.rawLogUploadGen;
    this.rawLogUploadStartedAt = now;
    try {
      // Snapshot buffer + persisted merge: we prefer uploading what's in memory
      // since it's the latest; on success we clear both.
      await this.flushRawLogToStorage().catch(() => {});
      // Oldest-first, bounded batch. Any remainder drains on the next tick, so a
      // reconnect after an offline spell catches up over a few seconds without a
      // single oversized POST.
      const snapshot = this.rawLogBuffer.slice(0, RAW_LOG_UPLOAD_BATCH);
      if (snapshot.length === 0) return true;
      const res = await this.postRawLogBatch(
        token,
        JSON.stringify({ entries: snapshot, appVersion: APP_VERSION }),
      );
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
      if (gen === this.rawLogUploadGen) {
        this.rawLogUploadStartedAt = null;
        this.uploadXhr = null;
      }
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
