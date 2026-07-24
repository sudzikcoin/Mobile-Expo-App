import BackgroundGeolocation, {
  State,
  Location,
} from "react-native-background-geolocation";
import { Alert, PermissionsAndroid, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PINGPOINT_BASE = "https://pingpoint.suverse.io";

let isReady = false;

// Native-geofence arrival/departure dispatch. driver-context registers a
// handler that marks the stop arrived/departed on the server. The transistorsoft
// SDK fires onGeofence natively — it wakes the app from background/terminated
// when the truck crosses a stop boundary, which is the whole point of native
// geofences (the previous build registered zero geofences, so onGeofence was
// dead code and arrival was detected only via the BLE-ELD software path).
type GeofenceAction = "ENTER" | "EXIT" | "DWELL";
let onStopGeofence: ((stopId: string, action: GeofenceAction) => void) | null = null;

export function setGeofenceHandler(
  cb: ((stopId: string, action: GeofenceAction) => void) | null,
): void {
  onStopGeofence = cb;
}

export interface GeofenceStop {
  id: string;
  lat: number | null | undefined;
  lng: number | null | undefined;
  radiusM?: number | null;
}

// Transistorsoft ignores geofences below a small radius; clamp up so a tight
// server value can't silently drop the zone. Matches the server's 2-mile
// default when no per-stop radius is supplied.
const MIN_GEOFENCE_RADIUS_M = 200;
const DEFAULT_GEOFENCE_RADIUS_M = 3200;

// Replace the full geofence set with the current load's stops. Stops without
// coordinates are logged and skipped (after the server-side geocoding fix these
// should be rare). Registered geofences persist in native storage across app
// restarts, so re-syncing on every load change keeps them correct.
// Returns true only when the set was actually (re)registered — false when the
// SDK isn't ready yet or the native call failed, so the caller knows to retry.
export async function syncStopGeofences(
  stops: GeofenceStop[],
): Promise<boolean> {
  if (!isReady) return false;
  const valid: GeofenceStop[] = [];
  for (const s of stops) {
    if (
      typeof s.lat === "number" &&
      typeof s.lng === "number" &&
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lng)
    ) {
      valid.push(s);
    } else {
      console.log(`[Geofence] Stop ${s.id} has no coords — skipping geofence`);
    }
  }
  try {
    await BackgroundGeolocation.removeGeofences();
    if (valid.length === 0) return true;
    await BackgroundGeolocation.addGeofences(
      valid.map((s) => ({
        identifier: s.id,
        latitude: s.lat as number,
        longitude: s.lng as number,
        radius: Math.max(s.radiusM ?? DEFAULT_GEOFENCE_RADIUS_M, MIN_GEOFENCE_RADIUS_M),
        notifyOnEntry: true,
        notifyOnExit: true,
        notifyOnDwell: false,
      })),
    );
    console.log(`[Geofence] Registered ${valid.length} native geofence(s)`);
    return true;
  } catch (err) {
    console.warn("[Geofence] Failed to sync geofences:", err);
    return false;
  }
}

// Android 13+ (API 33) requires runtime grant for POST_NOTIFICATIONS, even
// when the permission is in the manifest. Without it the foreground-service
// notification is suppressed and the OS kills the tracking process within
// ~10s of backgrounding. Older Android auto-grants.
// iOS never auto-grants: without an explicit UNUserNotificationCenter request
// the stop arrive/depart local notifications (notifications.ts) are silently
// dropped. Unlike Android, tracking itself does NOT depend on this on iOS —
// there is no foreground-service notification — so a denial only mutes the
// feedback channel.
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "ios") {
    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.granted) return true;
      const asked = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false },
      });
      return (
        asked.granted ||
        asked.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
      );
    } catch (err) {
      console.warn("[Permissions] iOS notification request failed:", err);
      return false;
    }
  }
  if (Platform.OS !== "android" || Platform.Version < 33) return true;
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: "Allow notifications",
        message:
          "PingPoint needs to show a tracking status notification to keep GPS active when the app is in background.",
        buttonPositive: "OK",
        buttonNegative: "Cancel",
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn("[Permissions] POST_NOTIFICATIONS request failed:", err);
    return false;
  }
}

// Doze puts the app in battery-optimized standby during long stationary
// stretches (overnight parking), deferring the 5-min heartbeat for hours.
// An exemption keeps the tracking service's alarms firing on schedule.
// Prompt at most once a week so a driver who declined isn't nagged every
// launch, and re-check the actual OS state each time (the user can revoke
// the exemption in settings at any point).
const BATT_OPT_PROMPT_KEY = "pp_batt_opt_prompted_at";
const BATT_OPT_REPROMPT_MS = 7 * 24 * 60 * 60 * 1000;

export async function requestBatteryOptimizationExemption(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const isIgnoring =
      await BackgroundGeolocation.deviceSettings.isIgnoringBatteryOptimizations();
    if (isIgnoring) return;

    const promptedAt = await AsyncStorage.getItem(BATT_OPT_PROMPT_KEY);
    if (promptedAt && Date.now() - Number(promptedAt) < BATT_OPT_REPROMPT_MS) {
      return;
    }
    await AsyncStorage.setItem(BATT_OPT_PROMPT_KEY, String(Date.now()));

    const request =
      await BackgroundGeolocation.deviceSettings.showIgnoreBatteryOptimizations();
    Alert.alert(
      "Keep tracking reliable",
      "Android pauses PingPoint's GPS during long stops to save battery, which delays arrival and departure updates to dispatch. Allow PingPoint to ignore battery optimizations on the next screen.",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Open settings",
          onPress: () => {
            BackgroundGeolocation.deviceSettings
              .show(request)
              .catch((err) =>
                console.warn("[BattOpt] settings screen failed:", err),
              );
          },
        },
      ],
    );
  } catch (err) {
    console.warn("[BattOpt] exemption check failed:", err);
  }
}

export interface TrackingDiagnostics {
  state: State;
  pendingPings: number;
  recentLog: string;
}

// Idempotent — safe to call multiple times. The SDK's `ready` only takes
// effect on the first call; subsequent calls are no-ops which is exactly
// what we want when DriverProvider re-renders.
export async function initTracking(
  truckToken: string,
  truckId: string,
): Promise<void> {
  if (!isReady) {
    await requestNotificationPermission();
    await BackgroundGeolocation.ready({
      desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
      distanceFilter: 500,

      stopTimeout: 5,
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: true,

      url: `${PINGPOINT_BASE}/api/truck/${truckToken}/ping`,
      method: "POST",
      autoSync: true,
      batchSync: false,
      maxDaysToPersist: 7,
      // Flatten body so backend reads lat/lng at root (matches the legacy
      // expo-location ping shape — easier backwards compat).
      httpRootProperty: ".",

      headers: {
        "Content-Type": "application/json",
      },

      params: {
        truck_id: truckId,
        source: "transistorsoft",
      },

      locationTemplate:
        '{"lat":<%= latitude %>,"lng":<%= longitude %>,"speed":<%= speed %>,"heading":<%= heading %>,"accuracy":<%= accuracy %>,"recorded_at":"<%= timestamp %>"}',

      debug: __DEV__,
      logLevel: __DEV__
        ? BackgroundGeolocation.LOG_LEVEL_VERBOSE
        : BackgroundGeolocation.LOG_LEVEL_ERROR,

      notification: {
        title: "PingPoint Driver tracking active",
        text: "Location sharing for dispatch tracking",
        channelName: "PingPoint Tracking",
        channelId: "pingpoint_tracking",
        smallIcon: "drawable/ic_notification",
        priority: BackgroundGeolocation.NOTIFICATION_PRIORITY_HIGH,
        sticky: true,
      },

      // Override transistorsoft's default rationale, which otherwise shows
      // the placeholder "[CHANGEME] FEATURE X / FEATURE Y" string in the
      // Android background-location prompt.
      backgroundPermissionRationale: {
        title:
          "Allow PingPoint Driver to access this device's location even when closed or not in use.",
        message:
          "PingPoint Driver tracks your truck location to share with dispatchers and brokers. Background location is required to continue tracking when the app is closed or the screen is off.",
        positiveAction: 'Change to "Allow all the time"',
        negativeAction: "Cancel",
      },

      // Stay quiet when stopped — don't drain battery on parking.
      preventSuspend: false,
      heartbeatInterval: 300,
    });

    // Wake every 5min to capture+sync even during Doze — caps the
    // server-visible delay at ~5min instead of the full 10–13min Doze
    // flush cycle. Without this, buffered pings sit on-device until
    // the OS allows the next sync window.
    BackgroundGeolocation.onHeartbeat(async () => {
      console.log("[Heartbeat] Tick — capturing location");
      try {
        await BackgroundGeolocation.getCurrentPosition({
          timeout: 30,
          maximumAge: 10000,
          desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
          samples: 1,
          persist: true,
        });
        await BackgroundGeolocation.sync();
      } catch (err) {
        console.warn("[Heartbeat] Failed:", err);
      }
    });

    // Geofence — pickup/delivery arrival must be on the server within
    // seconds, not bundled into the next batch flush. Capture a fresh fix,
    // flush the queue, then dispatch to the arrival/departure handler.
    BackgroundGeolocation.onGeofence(async (event) => {
      console.log("[Geofence]", event.action, event.identifier);
      try {
        await BackgroundGeolocation.getCurrentPosition({
          timeout: 30,
          maximumAge: 5000,
          desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
          samples: 1,
          persist: true,
        });
        await BackgroundGeolocation.sync();
      } catch (err) {
        console.warn("[Geofence] Sync failed:", err);
      }
      // Mark arrival/departure regardless of sync outcome — the stop event is
      // more important than the buffered pings and has its own retry.
      try {
        onStopGeofence?.(event.identifier, event.action as GeofenceAction);
      } catch (err) {
        console.warn("[Geofence] Handler failed:", err);
      }
    });

    isReady = true;
  } else {
    // Token / truck may have changed during a session (rare, but supported
    // via the "switch truck" flow). Patch the URL + params live.
    await BackgroundGeolocation.setConfig({
      url: `${PINGPOINT_BASE}/api/truck/${truckToken}/ping`,
      params: {
        truck_id: truckId,
        source: "transistorsoft",
      },
    });
  }

  // Force config sync — ready() is no-op on second+ calls (cached
  // in native storage), so plain JS-side bumps of distanceFilter
  // etc. don't propagate on APK upgrade. setConfig overwrites
  // unconditionally.
  await BackgroundGeolocation.setConfig({ distanceFilter: 500 });

  await BackgroundGeolocation.start();
}

export async function stopTracking(): Promise<void> {
  if (!isReady) return;
  await BackgroundGeolocation.stop();
}

export async function getTrackingState(): Promise<State> {
  return BackgroundGeolocation.getState();
}

export async function getDiagnostics(): Promise<TrackingDiagnostics> {
  const [state, pendingPings, recentLog] = await Promise.all([
    BackgroundGeolocation.getState(),
    BackgroundGeolocation.getCount(),
    BackgroundGeolocation.logger.getLog({ limit: 50 }),
  ]);
  return { state, pendingPings, recentLog };
}

// Subscribe to motion-state and provider changes so the UI can surface
// "Stationary" / "Provider disabled" banners. Returns an unsubscribe.
export function subscribeMotionChange(
  cb: (isMoving: boolean, location: Location) => void,
): () => void {
  const sub = BackgroundGeolocation.onMotionChange((event) => {
    cb(event.isMoving, event.location);
  });
  return () => sub.remove();
}

export function subscribeProviderChange(
  cb: (enabled: boolean, gps: boolean, network: boolean) => void,
): () => void {
  const sub = BackgroundGeolocation.onProviderChange((event) => {
    cb(event.enabled, event.gps, event.network);
  });
  return () => sub.remove();
}
