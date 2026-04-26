import BackgroundGeolocation, {
  State,
  Location,
} from "react-native-background-geolocation";

const PINGPOINT_BASE = "https://pingpoint.suverse.io";

let isReady = false;

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
    await BackgroundGeolocation.ready({
      desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
      distanceFilter: 100,

      stopTimeout: 5,
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: true,

      url: `${PINGPOINT_BASE}/api/truck/${truckToken}/ping`,
      method: "POST",
      autoSync: true,
      batchSync: false,
      maxDaysToPersist: 7,

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
        priority: BackgroundGeolocation.NOTIFICATION_PRIORITY_DEFAULT,
      },

      // Stay quiet when stopped — don't drain battery on parking.
      preventSuspend: false,
      heartbeatInterval: 0,
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
