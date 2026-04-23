import { Platform, PermissionsAndroid } from "react-native";
import { BleManager, Device, Subscription, State } from "react-native-ble-plx";
import { IOSiXData, emptyIOSiXData } from "./types";
import { IOSiXCycleBuffer } from "./parser";
import { setSnapshot } from "./store";

export const IOSIX_MAC = "E0:E2:E6:18:ED:B2";
export const IOSIX_SERVICE_UUID = "00000001-0000-1000-8000-00805f9b34fb";
export const IOSIX_CHAR_UUID = "00000001-0000-1000-8000-00805f9b34fb";
export const RECONNECT_INTERVAL_MS = 5000;
const SCAN_TIMEOUT_MS = 20_000;

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
          try {
            const raw = base64ToAscii(char.value);
            this.ingestFrame(raw);
          } catch {}
        }
      );
      this.update({ status: "connected", error: null });
    } catch (e) {
      this.scheduleReconnect(this.errMsg(e));
    }
  }

  private ingestFrame(raw: string): void {
    const parts = raw.split(/[\r\n]+/).filter((p) => p.length > 0);
    const lines = parts.length > 0 ? parts : [raw];
    for (const line of lines) {
      const cycle = this.buffer.push(line);
      if (cycle) {
        cycle.connected = true;
        cycle.signalDbm = this.state.lastRssi;
        this.update({ telemetry: cycle });
        setSnapshot(cycle);
      }
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
