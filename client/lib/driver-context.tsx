import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { Platform } from "react-native";

import { getDriverToken, setDriverToken as saveDriverToken, addLog, setLocationEnabled as saveLocationEnabled, isLocationEnabled as getLocationEnabled } from "./storage";
import {
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
  isBackgroundTrackingActive,
} from "./backgroundTask";
import { fetchDriverLoad, sendLocationPing, markStopArrival, markStopDeparture } from "./api";
import { Load } from "./types";
import { getFreshTelemetry } from "./iosix/store";
import { getIOSiXService } from "./iosix/service";
import {
  registerFcmTokenForDriver,
  subscribeToFcmTokenRefresh,
  handleFcmDataMessage,
} from "./fcm";
import messaging from "@react-native-firebase/messaging";

const GPS_PING_INTERVAL = 60000;

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
  
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const fcmRefreshUnsubRef = useRef<(() => void) | null>(null);
  const fcmFgUnsubRef = useRef<(() => void) | null>(null);

  const parseTokenFromUrl = (url: string): string | null => {
    try {
      console.log("[DeepLink] Parsing URL:", url);
      
      // Try direct path matching first for https:// URLs
      // Format: https://domain/driver/drv_xxxxx
      const pathMatch = url.match(/\/driver\/(drv_[a-zA-Z0-9]+)/);
      if (pathMatch) {
        console.log("[DeepLink] Extracted token from path:", pathMatch[1]);
        return pathMatch[1];
      }
      
      // Fallback: try any token format after /driver/
      const anyTokenMatch = url.match(/\/driver\/([^/?]+)/);
      if (anyTokenMatch && anyTokenMatch[1]) {
        console.log("[DeepLink] Extracted token (fallback):", anyTokenMatch[1]);
        return anyTokenMatch[1];
      }
      
      // Try expo-linking parser for pingpoint:// scheme
      const parsed = Linking.parse(url);
      console.log("[DeepLink] Parsed URL:", JSON.stringify(parsed));
      
      if (parsed.path?.startsWith("driver/")) {
        const token = parsed.path.replace("driver/", "");
        console.log("[DeepLink] Token from parsed path:", token);
        return token;
      }
      
      // Check query params
      if (parsed.queryParams?.token) {
        console.log("[DeepLink] Token from query params:", parsed.queryParams.token);
        return parsed.queryParams.token as string;
      }

      console.log("[DeepLink] No token found in URL");
      return null;
    } catch (e) {
      console.error("[DeepLink] Failed to parse URL:", e);
      return null;
    }
  };

  const setToken = async (newToken: string) => {
    if (!newToken || newToken === "undefined" || newToken === "null") {
      console.warn("[Driver] Attempted to set invalid token:", newToken);
      return;
    }
    console.log("[Driver] Setting token:", newToken);
    await saveDriverToken(newToken);
    setTokenState(newToken);
    setError(null);

    // Register the device's FCM token with the backend so the server-side
    // cron can wake us with silent pushes. Fire-and-forget; failures are
    // logged but don't block login.
    void registerFcmTokenForDriver(newToken);
    // Replace any prior refresh / fg subscriptions tied to an old token.
    if (fcmRefreshUnsubRef.current) {
      fcmRefreshUnsubRef.current();
      fcmRefreshUnsubRef.current = null;
    }
    if (fcmFgUnsubRef.current) {
      fcmFgUnsubRef.current();
      fcmFgUnsubRef.current = null;
    }
    fcmRefreshUnsubRef.current = subscribeToFcmTokenRefresh(newToken);
    fcmFgUnsubRef.current = messaging().onMessage(async (msg) => {
      console.log("[FCM][fg] message received");
      await handleFcmDataMessage(msg, "fcm_fg");
    });
  };

  const refreshLoad = useCallback(async () => {
    if (!token || token === "undefined" || token === "null") {
      console.log("[Driver] Skipping refresh - no valid token");
      return;
    }

    console.log("[Driver] Refreshing load for token:", token);

    try {
      setError(null);
      const result = await fetchDriverLoad(token);
      
      if (result) {
        console.log("[Driver] Load fetched successfully:", result.load.loadNumber);
        setLoad(result.load);
        setBalance(result.balance);
      } else {
        console.log("[Driver] No load found for token:", token);
        setLoad(null);
        setError("No active load found");
      }
    } catch (err) {
      console.error("[Driver] Failed to fetch load:", err);
      setError("Failed to connect to server");
    }
  }, [token]);

  const sendPing = useCallback(async () => {
    if (!token || !isLocationEnabled) return;

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      let iosix = null;
      try {
        iosix = await getFreshTelemetry();
      } catch {}

      const success = await sendLocationPing(token, {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy || 0,
        speed: location.coords.speed,
        heading: location.coords.heading,
        iosix,
      });

      if (success) {
        setLastPingTime(new Date());
        await addLog({
          action: "LOCATION_PING",
          location: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          },
        });
      }
    } catch (err) {
      console.error("Failed to send GPS ping:", err);
    }
  }, [token, isLocationEnabled]);

  const startLocationTracking = useCallback(async () => {
    // Останавливаем старый интервал если был
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    // Запускаем фоновый GPS через expo-task-manager
    const started = await startBackgroundLocationTracking();
    
    if (started) {
      console.log("[Driver] Background GPS tracking started");
    } else {
      // Fallback: если фоновый режим недоступен — используем интервал
      console.warn("[Driver] Background tracking unavailable, using interval fallback");
      await sendPing();
      pingIntervalRef.current = setInterval(sendPing, GPS_PING_INTERVAL);
    }
  }, [sendPing]);

  const stopLocationTracking = useCallback(async () => {
    // Останавливаем интервал если есть
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }

    // Останавливаем фоновый GPS
    await stopBackgroundLocationTracking();
    console.log("[Driver] Location tracking stopped");
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
        const permissionResult = await Location.requestForegroundPermissionsAsync();

        if (permissionResult.status !== "granted") {
          setIsLocationLoading(false);
          
          if (!permissionResult.canAskAgain) {
            setIsLocationDenied(true);
            setError("Location permission denied. Please enable in Settings.");
          } else {
            setError("Location permission denied");
          }
          return;
        }

        setIsLocationDenied(false);
        await saveLocationEnabled(true);
        await addLog({ action: "LOCATION_ENABLED" });
        setIsLocationEnabled(true);
        await startLocationTracking();
      } else {
        stopLocationTracking();
        await saveLocationEnabled(false);
        await addLog({ action: "LOCATION_DISABLED" });
        setIsLocationEnabled(false);
        setLastPingTime(null);
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
    getIOSiXService().start().catch(() => {});
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

  useEffect(() => {
    const init = async () => {
      try {
        const savedToken = await getDriverToken();
        const locationEnabled = await getLocationEnabled();
        
        if (savedToken) {
          setTokenState(savedToken);
        }
        
        setIsLocationEnabled(locationEnabled);

        // Если GPS был включён — перезапускаем трекинг (task manager сбрасывается при перезапуске)
        if (locationEnabled && savedToken) {
          setIsLocationEnabled(true);
          // Запускаем через 2 сек после инициализации токена
          setTimeout(async () => {
            const started = await startBackgroundLocationTracking();
            if (started) {
              console.log("[Driver] Background GPS restarted on app init");
            } else {
              console.warn("[Driver] Background GPS restart failed on init");
            }
          }, 2000);
        }
      } catch (err) {
        console.error("Failed to initialize:", err);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

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
  }, []);

  useEffect(() => {
    if (token && token !== "undefined" && token !== "null") {
      console.log("[Driver] Token changed, fetching load:", token);
      setIsLoading(true);
      refreshLoad().finally(() => setIsLoading(false));
    }
  }, [token, refreshLoad]);

  useEffect(() => {
    if (token && isLocationEnabled) {
      startLocationTracking();
    }

    return () => {
      stopLocationTracking();
    };
  }, [token, isLocationEnabled, startLocationTracking, stopLocationTracking]);


  // Polling нового груза каждые 30 секунд
  useEffect(() => {
    if (!token || token === "undefined" || token === "null") return;

    const checkNewLoad = async () => {
      try {
        const res = await fetch(`https://pingpoint.suverse.io/api/driver/${token}/next-load`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.hasNewLoad && data.newToken) {
          console.log("[Driver] New load available, switching to token:", data.newToken);
          await setToken(data.newToken);
        }
      } catch {
        // Игнорируем ошибки polling
      }
    };

    const interval = setInterval(checkNewLoad, 30000);
    return () => clearInterval(interval);
  }, [token]);

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
