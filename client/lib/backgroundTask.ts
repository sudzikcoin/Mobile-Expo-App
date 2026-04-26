import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { getActiveToken, isTruckToken, addLog, isLocationEnabled } from "./storage";
import { getFreshTelemetry } from "./iosix/store";
import { IOSIX_MAC } from "./iosix/service";

export const BACKGROUND_LOCATION_TASK = "PINGPOINT_BACKGROUND_LOCATION";

const PINGPOINT_API = "https://pingpoint.suverse.io";

// Определяем фоновую задачу — ДОЛЖНА быть на верхнем уровне модуля
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error("[BGTask] Location task error:", error);
    return;
  }

  if (!data) return;

  try {
    const locationEnabled = await isLocationEnabled();
    if (!locationEnabled) return;

    const token = await getActiveToken();
    if (!token) return;

    const { locations } = data as { locations: Location.LocationObject[] };
    const location = locations?.[0];
    if (!location) return;

    let iosix = null;
    try {
      iosix = await getFreshTelemetry();
    } catch {}

    const pingPath = isTruckToken(token)
      ? `/api/truck/${token}/ping`
      : `/api/driver/${token}/ping`;
    const response = await fetch(`${PINGPOINT_API}${pingPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy || 0,
        speed: location.coords.speed,
        heading: iosix?.heading ?? location.coords.heading,
        rpm: iosix?.rpm ?? null,
        engineLoadPct: iosix?.engineLoadPct ?? null,
        coolantTempC: iosix?.coolantTempC ?? null,
        oilPressureKpa: iosix?.oilPressureKpa ?? null,
        fuelRateGph: iosix?.fuelRateGph ?? null,
        totalFuelUsedGal: iosix?.totalFuelUsedGal ?? null,
        engineHours: iosix?.engineHours ?? null,
        throttlePct: iosix?.throttlePct ?? null,
        batteryVoltage: iosix?.batteryVoltage ?? null,
        odometerMiles: iosix?.odometerMiles ?? null,
        tripMiles: iosix?.tripMiles ?? null,
        currentGear: iosix?.currentGear ?? null,
        dpfSootLoadPct: iosix?.dpfSootLoadPct ?? null,
        defLevelPct: iosix?.defLevelPct ?? null,
        activeDtcCount: iosix?.activeDtcCount ?? null,
        activeDtcCodes: iosix?.activeDtcCodes ?? null,
        eldConnected: iosix?.connected ?? false,
        eldMac: iosix?.connected ? IOSIX_MAC : null,
        eldPacketCycleComplete: iosix?.packetCycleComplete ?? false,
      }),
    });

    if (response.ok) {
      await addLog({
        action: "LOCATION_PING",
        location: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
      });
      const iosixInfo = iosix?.connected ? ` iosix=ok rpm=${iosix.rpm ?? "-"} fuel=${iosix.fuelRateGph ?? "-"}gph` : "";
      console.log("[BGTask] GPS ping sent:", location.coords.latitude, location.coords.longitude, iosixInfo);
    }
  } catch (err) {
    console.error("[BGTask] Failed to send ping:", err);
  }
});

export async function startBackgroundLocationTracking(): Promise<boolean> {
  try {
    // Запрашиваем разрешение foreground
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== "granted") {
      console.warn("[BGTask] Foreground location permission denied");
      return false;
    }

    // Запрашиваем разрешение background
    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== "granted") {
      console.warn("[BGTask] Background location permission denied — falling back to foreground only");
      // Продолжаем без фонового режима
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isRegistered) {
      console.log("[BGTask] Already registered");
      return true;
    }

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 120000,
      distanceInterval: 200,
      foregroundService: {
        notificationTitle: "PingPoint Tracking — DO NOT CLOSE",
        notificationBody: "GPS активен. Закрытие остановит трекинг.",
        notificationColor: "#FF0000",
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });

    console.log("[BGTask] Background location tracking started");
    startHeartbeatWatchdog();
    return true;
  } catch (err) {
    console.error("[BGTask] Failed to start background tracking:", err);
    return false;
  }
}

export async function stopBackgroundLocationTracking(): Promise<void> {
  try {
    stopHeartbeatWatchdog();
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log("[BGTask] Background location tracking stopped");
    }
  } catch (err) {
    console.error("[BGTask] Failed to stop background tracking:", err);
  }
}

export async function isBackgroundTrackingActive(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    return false;
  }
}

// Watchdog: каждые 30 сек проверяет, что Location task жив,
// и рестартит startLocationUpdatesAsync, если он умер
// (Android может убить background-сервис при экстремальном дозинге).
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function startHeartbeatWatchdog(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(async () => {
    try {
      const alive = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      const ts = new Date().toISOString();
      if (alive) {
        console.log(`[BGTask][HB ${ts}] Location task alive`);
        try { await addLog({ action: "BG_HEARTBEAT_OK" }); } catch {}
      } else {
        console.warn(`[BGTask][HB ${ts}] Location task DEAD — restarting`);
        try { await addLog({ action: "BG_HEARTBEAT_DEAD_RESTART" }); } catch {}
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,
          distanceInterval: 50,
          foregroundService: {
            notificationTitle: "PingPoint Tracking — DO NOT CLOSE",
            notificationBody: "GPS активен. Закрытие остановит трекинг.",
            notificationColor: "#FF0000",
          },
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
        });
        console.log("[BGTask][HB] Restart issued");
      }
    } catch (err) {
      console.error("[BGTask][HB] Heartbeat error:", err);
    }
  }, 30_000);
  console.log("[BGTask] Heartbeat watchdog started (30s)");
}

export function stopHeartbeatWatchdog(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    console.log("[BGTask] Heartbeat watchdog stopped");
  }
}
