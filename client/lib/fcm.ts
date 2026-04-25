import messaging, {
  FirebaseMessagingTypes,
} from "@react-native-firebase/messaging";
import * as Location from "expo-location";
import { addLog, getDriverToken } from "./storage";
import { getFreshTelemetry } from "./iosix/store";
import { IOSIX_MAC } from "./iosix/service";

const PINGPOINT_API = "https://pingpoint.suverse.io";

// Send a single GPS ping to the backend, mirroring the payload the
// background TaskManager produces. Used by the FCM data-message handler
// (silent push wakes the app, app sends one ping).
export async function sendOneGpsPing(reason: string): Promise<boolean> {
  try {
    const token = await getDriverToken();
    if (!token) {
      console.warn("[FCM][ping] no driver token, skip");
      return false;
    }

    const fgPerm = await Location.getForegroundPermissionsAsync();
    if (fgPerm.status !== "granted") {
      console.warn("[FCM][ping] no location permission, skip");
      return false;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    let iosix: any = null;
    try {
      iosix = await getFreshTelemetry();
    } catch {}

    const response = await fetch(
      `${PINGPOINT_API}/api/driver/${token}/ping`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy || 0,
          speed: position.coords.speed,
          heading: iosix?.heading ?? position.coords.heading,
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
      },
    );

    if (response.ok) {
      try {
        await addLog({
          action: "FCM_PING_TRIGGERED",
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        });
      } catch {}
      console.log(
        `[FCM][ping] sent (reason=${reason}) lat=${position.coords.latitude} lng=${position.coords.longitude}`,
      );
      return true;
    }
    console.warn(
      `[FCM][ping] backend rejected status=${response.status} reason=${reason}`,
    );
    return false;
  } catch (err) {
    console.error("[FCM][ping] error:", err);
    return false;
  }
}

async function postFcmTokenToBackend(
  driverToken: string,
  fcmToken: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${PINGPOINT_API}/api/driver/${driverToken}/fcm-register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fcmToken }),
      },
    );
    if (res.ok) {
      try {
        await addLog({ action: "FCM_TOKEN_REGISTERED" });
      } catch {}
      console.log(
        `[FCM][register] OK driver=${driverToken.substring(0, 8)}... fcm=${fcmToken.substring(0, 16)}...`,
      );
      return true;
    }
    console.warn(`[FCM][register] backend status=${res.status}`);
    return false;
  } catch (err) {
    console.error("[FCM][register] post error:", err);
    return false;
  }
}

// Request permission, fetch the current FCM token, and POST it to the
// backend so the cron can send pings to this device. Idempotent — safe
// to call on every login.
export async function registerFcmTokenForDriver(
  driverToken: string,
): Promise<void> {
  try {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    if (!enabled) {
      console.warn("[FCM][register] permission denied:", authStatus);
      return;
    }
    const fcmToken = await messaging().getToken();
    if (!fcmToken) {
      console.warn("[FCM][register] empty FCM token from getToken()");
      return;
    }
    await postFcmTokenToBackend(driverToken, fcmToken);
  } catch (err) {
    console.error("[FCM][register] failed:", err);
  }
}

// Subscribe to FCM token refresh events (token rotates periodically) and
// re-register with the backend. Returns an unsubscribe fn.
export function subscribeToFcmTokenRefresh(driverToken: string): () => void {
  const unsubscribe = messaging().onTokenRefresh((newToken) => {
    console.log("[FCM][refresh] new token, re-registering");
    void postFcmTokenToBackend(driverToken, newToken);
  });
  return unsubscribe;
}

// Common handler shared by foreground + background message paths.
// We only act on data-only messages with type=ping_request.
export async function handleFcmDataMessage(
  message: FirebaseMessagingTypes.RemoteMessage,
  reason: string,
): Promise<void> {
  const data = message?.data ?? {};
  if (data.type !== "ping_request") {
    console.log("[FCM][msg] ignored non-ping data:", data);
    return;
  }
  await sendOneGpsPing(reason);
}
