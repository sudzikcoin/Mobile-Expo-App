import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { Platform } from "react-native";

import { getDriverToken, setDriverToken as saveDriverToken, addLog, setLocationEnabled as saveLocationEnabled, isLocationEnabled as getLocationEnabled } from "./storage";
import { fetchDriverLoad, sendLocationPing, markStopArrival, markStopDeparture } from "./api";
import { Load } from "./types";

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

  const parseTokenFromUrl = (url: string): string | null => {
    try {
      const parsed = Linking.parse(url);
      
      if (parsed.path?.startsWith("driver/")) {
        return parsed.path.replace("driver/", "");
      }
      
      if (parsed.queryParams?.token) {
        return parsed.queryParams.token as string;
      }
      
      const pathMatch = url.match(/\/driver\/([^/?]+)/);
      if (pathMatch) {
        return pathMatch[1];
      }

      return null;
    } catch (e) {
      console.error("Failed to parse URL:", e);
      return null;
    }
  };

  const setToken = async (newToken: string) => {
    await saveDriverToken(newToken);
    setTokenState(newToken);
    setError(null);
  };

  const refreshLoad = useCallback(async () => {
    if (!token) return;

    try {
      setError(null);
      const result = await fetchDriverLoad(token);
      
      if (result) {
        setLoad(result.load);
        setBalance(result.balance);
      } else {
        setLoad(null);
        setError("No active load found");
      }
    } catch (err) {
      console.error("Failed to fetch load:", err);
      setError("Failed to connect to server");
    }
  }, [token]);

  const sendPing = useCallback(async () => {
    if (!token || !isLocationEnabled) return;

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const success = await sendLocationPing(token, {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy || 0,
        speed: location.coords.speed,
        heading: location.coords.heading,
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
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    await sendPing();

    pingIntervalRef.current = setInterval(sendPing, GPS_PING_INTERVAL);
  }, [sendPing]);

  const stopLocationTracking = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
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

  useEffect(() => {
    const init = async () => {
      try {
        const savedToken = await getDriverToken();
        const locationEnabled = await getLocationEnabled();
        
        if (savedToken) {
          setTokenState(savedToken);
        }
        
        setIsLocationEnabled(locationEnabled);
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
    if (token) {
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
