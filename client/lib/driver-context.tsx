import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import * as Linking from "expo-linking";
import { AppState, Platform } from "react-native";

import {
  getDriverToken,
  setDriverToken as saveDriverToken,
  addLog,
  setLocationEnabled as saveLocationEnabled,
  getActiveToken,
  getTruckToken,
  setTruckToken,
  getTruckId,
  isTruckToken,
  maskToken,
} from "./storage";
import {
  initTracking,
  stopTracking,
  setGeofenceHandler,
  syncStopGeofences,
  requestBatteryOptimizationExemption,
} from "./transistorsoftTracking";
import {
  fetchDriverLoad,
  markStopArrival,
  markStopDeparture,
  fetchActiveLoadForTruck,
} from "./api";
import { Load } from "./types";
import { notifyStopEvent } from "./notifications";
import { getIOSiXService } from "./iosix/service";
import {
  registerFcmTokenForDriver,
  subscribeToFcmTokenRefresh,
  handleFcmDataMessage,
} from "./fcm";
import messaging from "@react-native-firebase/messaging";

interface DriverContextType {
  token: string | null;
  isLoading: boolean;
  error: string | null;
  load: Load | null;
  balance: number;
  isLocationEnabled: boolean;
  isLocationLoading: boolean;
  isLocationDenied: boolean;
  lastPingTime: Date | null;
  setToken: (token: string) => Promise<void>;
  refreshLoad: () => Promise<void>;
  toggleLocation: () => Promise<void>;
  openSettings: () => Promise<void>;
  handleStopAction: (stopId: string, action: "arrive" | "depart") => Promise<{ success: boolean; pointsAwarded: number }>;
}

const DriverContext = createContext<DriverContextType | undefined>(undefined);

// Safety net: if the transistorsoft SDK ever hangs in ready()/stop() (seen
// once on Android 10 when the location provider was mid-toggle), make sure
// we surface the failure instead of leaving the UI stuck on "loading".
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

export function DriverProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [load, setLoad] = useState<Load | null>(null);
  const [balance, setBalance] = useState(0);
  const [isLocationEnabled, setIsLocationEnabled] = useState(false);
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const [isLocationDenied, setIsLocationDenied] = useState(false);
  const [lastPingTime, setLastPingTime] = useState<Date | null>(null);
  
  const fcmRefreshUnsubRef = useRef<(() => void) | null>(null);
  const fcmFgUnsubRef = useRef<(() => void) | null>(null);

  // Native geofence callbacks fire from background/terminated state, so they
  // read current token/load through refs rather than a stale render closure.
  const tokenRef = useRef<string | null>(null);
  const loadRef = useRef<Load | null>(null);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const parseTokenFromUrl = (url: string): string | null => {
    try {
      console.log("[DeepLink] Parsing URL:", url);
      
      // Try direct path matching first for https:// URLs
      // Format: https://domain/driver/drv_xxxxx
      const pathMatch = url.match(/\/driver\/(drv_[a-zA-Z0-9]+)/);
      if (pathMatch) {
        console.log("[DeepLink] Extracted token from path:", maskToken(pathMatch[1]));
        return pathMatch[1];
      }
      
      // Fallback: try any token format after /driver/
      const anyTokenMatch = url.match(/\/driver\/([^/?]+)/);
      if (anyTokenMatch && anyTokenMatch[1]) {
        console.log("[DeepLink] Extracted token (fallback):", maskToken(anyTokenMatch[1]));
        return anyTokenMatch[1];
      }
      
      // Try expo-linking parser for pingpoint:// scheme
      const parsed = Linking.parse(url);
      console.log("[DeepLink] Parsed URL:", JSON.stringify(parsed));
      
      if (parsed.path?.startsWith("driver/")) {
        const token = parsed.path.replace("driver/", "");
        console.log("[DeepLink] Token from parsed path:", maskToken(token));
        return token;
      }
      
      // Check query params
      if (parsed.queryParams?.token) {
        console.log("[DeepLink] Token from query params:", maskToken(parsed.queryParams.token));
        return parsed.queryParams.token as string;
      }

      console.log("[DeepLink] No token found in URL");
      return null;
    } catch (e) {
      console.error("[DeepLink] Failed to parse URL:", e);
      return null;
    }
  };

  // Register the device's FCM token with the backend and (re)wire the
  // refresh / foreground-message subscriptions. Must run on EVERY path that
  // lands a token — including cold start with a saved token — not just the
  // deep-link login: registration used to live only in setToken(), so a
  // normally-restarted app never re-registered and the server kept pushing
  // to a token FCM had long expired ("registration-token-not-registered").
  const wireFcm = useCallback((driverToken: string) => {
    // Fire-and-forget; failures are logged but don't block login/startup.
    void registerFcmTokenForDriver(driverToken);
    // Replace any prior refresh / fg subscriptions tied to an old token.
    if (fcmRefreshUnsubRef.current) {
      fcmRefreshUnsubRef.current();
      fcmRefreshUnsubRef.current = null;
    }
    if (fcmFgUnsubRef.current) {
      fcmFgUnsubRef.current();
      fcmFgUnsubRef.current = null;
    }
    fcmRefreshUnsubRef.current = subscribeToFcmTokenRefresh(driverToken);
    fcmFgUnsubRef.current = messaging().onMessage(async (msg) => {
      console.log("[FCM][fg] message received");
      await handleFcmDataMessage(msg, "fcm_fg");
    });
  }, []);

  const setToken = useCallback(
    async (newToken: string) => {
      if (!newToken || newToken === "undefined" || newToken === "null") {
        console.warn("[Driver] Attempted to set invalid token:", maskToken(newToken));
        return;
      }
      console.log("[Driver] Setting token:", maskToken(newToken));
      if (isTruckToken(newToken)) {
        await setTruckToken(newToken);
      } else {
        await saveDriverToken(newToken);
      }
      setTokenState(newToken);
      setError(null);
      wireFcm(newToken);
    },
    [wireFcm],
  );

  const refreshLoad = useCallback(async () => {
    if (!token || token === "undefined" || token === "null") {
      console.log("[Driver] Skipping refresh - no valid token");
      return;
    }

    console.log("[Driver] Refreshing load for token:", maskToken(token));

    try {
      setError(null);
      const result = isTruckToken(token)
        ? await fetchActiveLoadForTruck(token)
        : await fetchDriverLoad(token);

      if (result) {
        console.log("[Driver] Load fetched successfully:", result.load.loadNumber);
        setLoad(result.load);
        setBalance(result.balance);
      } else {
        console.log("[Driver] No load found for token:", maskToken(token));
        setLoad(null);
        // For truck tokens "no active load" is a normal state — the truck is
        // registered, just sitting idle waiting for dispatch. Don't surface
        // an error banner in that case.
        if (!isTruckToken(token)) {
          setError("No active load found");
        }
      }
    } catch (err) {
      console.error("[Driver] Failed to fetch load:", err);
      setError("Failed to connect to server");
    }
  }, [token]);

  const startLocationTracking = useCallback(async () => {
    if (!token || !isTruckToken(token)) {
      // Legacy drv_ tokens are not wired to transistorsoft (URL is truck-only).
      // The deep-link flow will not produce GPS pings until migrated to a
      // truck token.
      console.warn("[Driver] Skipping tracking init: not a truck token");
      return;
    }
    const truckId = await getTruckId();
    if (!truckId) {
      console.warn("[Driver] Skipping tracking init: missing truck_id");
      return;
    }
    try {
      await withTimeout(initTracking(token, truckId), 15000, "initTracking");
      console.log("[Driver] Transistorsoft tracking started");
      // Fire-and-forget: shows at most one weekly prompt when the app isn't
      // exempt from battery optimization (Doze delays heartbeats for hours
      // on overnight stops without it).
      void requestBatteryOptimizationExemption();
    } catch (err) {
      console.error("[Driver] startLocationTracking failed:", err);
    }
  }, [token]);

  const stopLocationTracking = useCallback(async () => {
    try {
      await withTimeout(stopTracking(), 15000, "stopTracking");
      console.log("[Driver] Transistorsoft tracking stopped");
    } catch (err) {
      console.error("[Driver] stopLocationTracking failed:", err);
    }
  }, []);

  const openSettings = async () => {
    if (Platform.OS !== "web") {
      try {
        await Linking.openSettings();
      } catch (err) {
        console.error("Failed to open settings:", err);
      }
    }
  };

  const toggleLocation = async () => {
    setIsLocationLoading(true);

    try {
      if (!isLocationEnabled) {
        // Flip persisted intent + state only. The useEffect on
        // [token, isLocationEnabled] is the single owner of start/stop —
        // calling startLocationTracking() here too would race the effect
        // (effect's cleanup from the previous render fires first, then a
        // fresh effect run, plus our direct call = two starts overlapping).
        // Transistorsoft prompts for permission internally on start().
        setIsLocationDenied(false);
        await saveLocationEnabled(true);
        await addLog({ action: "LOCATION_ENABLED" });
        setIsLocationEnabled(true);
      } else {
        // Variant 1: one-way toggle. Disable is a no-op for fleet ops.
        await addLog({ action: "LOCATION_DISABLE_BLOCKED" });
      }
    } catch (err) {
      console.error("Failed to toggle location:", err);
      setError("Failed to toggle location tracking");
    } finally {
      setIsLocationLoading(false);
    }
  };

  const handleStopAction = async (stopId: string, action: "arrive" | "depart"): Promise<{ success: boolean; pointsAwarded: number }> => {
    if (!token) return { success: false, pointsAwarded: 0 };

    try {
      const result = action === "arrive"
        ? await markStopArrival(token, stopId)
        : await markStopDeparture(token, stopId);

      if (result.success) {
        setBalance(result.newBalance);
        
        const currentStop = load?.stops.find(s => s.id === stopId);
        await addLog({
          action: action === "arrive" ? "ARRIVE" : "DEPART",
          stopId,
          stopName: currentStop?.companyName,
        });

        await refreshLoad();
      }

      return { success: result.success, pointsAwarded: result.pointsAwarded };
    } catch (err) {
      console.error(`Failed to ${action}:`, err);
      setError(`Failed to ${action}. Please try again.`);
      return { success: false, pointsAwarded: 0 };
    }
  };

  // Start the IOSiX BLE service once at provider mount so telemetry is
  // available to both UI (via useIOSiXTelemetry) and the headless ping
  // task (via getFreshTelemetry). The service no-ops if BLE permission
  // is denied or the ELD is out of range — no error surfaces to the user.
  useEffect(() => {
    getIOSiXService().start().catch((err) => {
      // BLE ELD is supplementary (arrival now runs on native geofences), but a
      // start failure was previously invisible — log it so a dead ELD link is
      // diagnosable instead of silent.
      console.warn("[Driver] IOSiX service start failed:", err);
    });
  }, []);

  // Wire ELD-driven auto arrive/depart: service evaluates speed + distance
  // to load stops on each telemetry cycle and fires the callbacks when the
  // geofence + dwell conditions are met. Reconfigured whenever the load or
  // token changes so stale coords/handlers aren't held.
  useEffect(() => {
    const svc = getIOSiXService();
    svc.setRawLogToken(token);
    if (!token || !load) {
      svc.configureAutoArriveDepart(null);
      return;
    }
    const stops = load.stops
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => ({
        id: s.id,
        type: s.type,
        lat: s.lat as number,
        lng: s.lng as number,
        arrivedAt: s.arrivedAt ?? null,
        departedAt: s.departedAt ?? null,
      }));
    svc.configureAutoArriveDepart({
      token,
      stops,
      onArrive: async (stopId) => {
        try {
          await markStopArrival(token, stopId);
          await addLog({ action: "ARRIVE", stopId, stopName: load.stops.find((x) => x.id === stopId)?.companyName });
          await refreshLoad();
        } catch (err) {
          console.error("[AutoAD] arrive failed:", err);
        }
      },
      onDepart: async (stopId) => {
        try {
          await markStopDeparture(token, stopId);
          await addLog({ action: "DEPART", stopId, stopName: load.stops.find((x) => x.id === stopId)?.companyName });
          await refreshLoad();
        } catch (err) {
          console.error("[AutoAD] depart failed:", err);
        }
      },
    });
  }, [token, load, refreshLoad]);

  // Register the native-geofence arrival/departure handler once. It reads
  // current token/load via refs because it fires from background/terminated.
  useEffect(() => {
    setGeofenceHandler(async (stopId, action) => {
      const tk = tokenRef.current;
      const ld = loadRef.current;
      if (!tk || !ld) return;
      const stop = ld.stops.find((s) => s.id === stopId);
      if (!stop) return;
      try {
        if (action === "ENTER" && !stop.arrivedAt) {
          await markStopArrival(tk, stopId);
          void notifyStopEvent("ENTER", stop.companyName);
          await addLog({ action: "ARRIVE", stopId, stopName: stop.companyName });
          await refreshLoad();
        } else if (action === "EXIT" && stop.arrivedAt && !stop.departedAt) {
          await markStopDeparture(tk, stopId);
          void notifyStopEvent("EXIT", stop.companyName);
          await addLog({ action: "DEPART", stopId, stopName: stop.companyName });
          await refreshLoad();
        }
      } catch (err) {
        console.error("[Geofence] arrive/depart failed:", err);
      }
    });
    return () => setGeofenceHandler(null);
  }, [refreshLoad]);

  // Keep native geofences in sync with the active load's stops. Stops without
  // coordinates are skipped inside syncStopGeofences (logged there).
  // refreshLoad produces a fresh load object on every successful poll, so this
  // effect fires every ~30s; re-registering an identical geofence set each time
  // is pure native churn (removeGeofences + addGeofences). Compare by stop
  // content instead, and record the signature only after a successful sync so
  // a not-ready/failed attempt is retried on the next poll tick.
  const lastGeofenceSigRef = useRef<string | null>(null);
  const geofenceSyncSeqRef = useRef(0);
  useEffect(() => {
    if (!token || !isTruckToken(token)) return;
    const stops = (load?.stops ?? []).map((s) => ({
      id: s.id,
      lat: s.lat,
      lng: s.lng,
      radiusM: s.geofenceRadiusM ?? null,
    }));
    const sig = stops
      .map((s) => `${s.id}:${s.lat}:${s.lng}:${s.radiusM}`)
      .join("|");
    if (sig === lastGeofenceSigRef.current) return;
    // Seq guard: if the stops change again while a sync is in flight, the
    // stale completion must not record its signature over the newer one.
    const seq = ++geofenceSyncSeqRef.current;
    void syncStopGeofences(stops).then((synced) => {
      if (synced && seq === geofenceSyncSeqRef.current) {
        lastGeofenceSigRef.current = sig;
      }
    });
  }, [token, load]);

  useEffect(() => {
    const init = async () => {
      try {
        // Truck token (new flow) takes precedence over per-load drv_xxx.
        const savedToken = await getActiveToken();
        // Variant 1: tracking always on. Force-persist true so reads stay stable.
        await saveLocationEnabled(true);

        if (savedToken) {
          setTokenState(savedToken);
          // Re-register FCM + subscriptions on cold start too. FCM tokens
          // rotate; a fleet that only deep-links once (then always restarts
          // normally) would otherwise never report the rotated token.
          wireFcm(savedToken);
        }

        setIsLocationEnabled(true);

        // Transistorsoft survives boot via startOnBoot:true and survives
        // process kill via stopOnTerminate:false. On a normal cold-start we
        // still need to call start() to re-attach the JS layer; the useEffect
        // on [token, isLocationEnabled] below handles that once both land.
      } catch (err) {
        console.error("Failed to initialize:", err);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [wireFcm]);

  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      const parsedToken = parseTokenFromUrl(event.url);
      if (parsedToken) {
        setToken(parsedToken);
      }
    };

    const checkInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleUrl({ url: initialUrl });
      }
    };

    checkInitialUrl();
    const subscription = Linking.addEventListener("url", handleUrl);

    return () => {
      subscription.remove();
    };
  }, [setToken]);

  useEffect(() => {
    if (token && token !== "undefined" && token !== "null") {
      console.log("[Driver] Token changed, fetching load:", maskToken(token));
      setIsLoading(true);
      refreshLoad().finally(() => setIsLoading(false));
    }
  }, [token, refreshLoad]);

  // Poll for load changes at the provider level, independent of which screen
  // is mounted. New loads have no push channel (FCM data messages are
  // ping_request-only), so this interval is what surfaces a newly dispatched
  // load while the app is in the foreground. It used to live in
  // DashboardScreen only — off that screen the app went blind. RN timers
  // freeze while the app is backgrounded; the AppState listener below covers
  // the catch-up when the driver brings the app back.
  useEffect(() => {
    if (!token || token === "undefined" || token === "null") return;
    const interval = setInterval(() => {
      void refreshLoad();
    }, 30000);
    return () => clearInterval(interval);
  }, [token, refreshLoad]);

  // Refresh immediately when the app returns to the foreground: background
  // JS timers don't fire on Android, so without this the driver reopens the
  // app onto data as stale as when they left it.
  useEffect(() => {
    if (!token || token === "undefined" || token === "null") return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        console.log("[Driver] App foregrounded — refreshing load");
        void refreshLoad();
      }
    });
    return () => sub.remove();
  }, [token, refreshLoad]);

  useEffect(() => {
    if (token && isLocationEnabled) {
      startLocationTracking();
    }

    return () => {
      stopLocationTracking();
    };
  }, [token, isLocationEnabled, startLocationTracking, stopLocationTracking]);


  // Legacy: per-load drv_xxx token rotation polling. Truck tokens are
  // permanent — when a new load lands, refreshLoad picks it up via
  // /api/truck/:token/active-load. So polling is a no-op for trk_*.
  useEffect(() => {
    if (!token || token === "undefined" || token === "null") return;
    if (isTruckToken(token)) return;

    const checkNewLoad = async () => {
      try {
        const res = await fetch(`https://pingpoint.suverse.io/api/driver/${token}/next-load`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.hasNewLoad && data.newToken) {
          console.log("[Driver] New load available, switching to token:", maskToken(data.newToken));
          await setToken(data.newToken);
        }
      } catch {
        // Игнорируем ошибки polling
      }
    };

    const interval = setInterval(checkNewLoad, 30000);
    return () => clearInterval(interval);
  }, [token, setToken]);

  // Tear down FCM listeners on unmount.
  useEffect(() => {
    return () => {
      if (fcmRefreshUnsubRef.current) {
        fcmRefreshUnsubRef.current();
        fcmRefreshUnsubRef.current = null;
      }
      if (fcmFgUnsubRef.current) {
        fcmFgUnsubRef.current();
        fcmFgUnsubRef.current = null;
      }
    };
  }, []);

  return (
    <DriverContext.Provider
      value={{
        token,
        isLoading,
        error,
        load,
        balance,
        isLocationEnabled,
        isLocationLoading,
        isLocationDenied,
        lastPingTime,
        setToken,
        refreshLoad,
        toggleLocation,
        openSettings,
        handleStopAction,
      }}
    >
      {children}
    </DriverContext.Provider>
  );
}

export function useDriver() {
  const context = useContext(DriverContext);
  if (context === undefined) {
    throw new Error("useDriver must be used within a DriverProvider");
  }
  return context;
}
