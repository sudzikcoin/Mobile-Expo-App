import AsyncStorage from "@react-native-async-storage/async-storage";
import { DriverData, LogEntry, Load } from "./types";

const KEYS = {
  DRIVER_TOKEN: "@pingpoint_driver_token",
  TRUCK_TOKEN: "@pingpoint_truck_token",
  DRIVER_BALANCE: "@pingpoint_driver_balance",
  CURRENT_LOAD: "@pingpoint_current_load",
  COMPLETED_LOADS: "@pingpoint_completed_loads",
  LOGS: "@pingpoint_logs",
  LOCATION_ENABLED: "@pingpoint_location_enabled",
  TRUCK_ID: "@pingpoint_truck_id",
  TRUCK_NUMBER: "@pingpoint_truck_number",
  COMPANY_ID: "@pingpoint_company_id",
  COMPANY_NAME: "@pingpoint_company_name",
  DRIVER_NAME: "@pingpoint_driver_name",
  TRUCK_SETUP_COMPLETE: "@pingpoint_truck_setup_complete",
};

// Returns the active token, preferring per-truck (new flow) over per-load (legacy).
// Calls go to /api/truck/* when token starts with trk_, /api/driver/* otherwise.
export async function getActiveToken(): Promise<string | null> {
  const truck = await getTruckToken();
  if (truck) return truck;
  return getDriverToken();
}

export function isTruckToken(t: string | null | undefined): boolean {
  return typeof t === "string" && t.startsWith("trk_");
}

export async function getDriverToken(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(KEYS.DRIVER_TOKEN);
    // Filter out invalid tokens that may have been persisted as strings
    if (token === "undefined" || token === "null" || token === "") {
      await AsyncStorage.removeItem(KEYS.DRIVER_TOKEN);
      return null;
    }
    return token;
  } catch (error) {
    console.error("Failed to get driver token:", error);
    return null;
  }
}

export async function setDriverToken(token: string): Promise<void> {
  try {
    // Don't save invalid tokens
    if (!token || token === "undefined" || token === "null") {
      console.warn("[Storage] Attempted to save invalid token:", token);
      return;
    }
    await AsyncStorage.setItem(KEYS.DRIVER_TOKEN, token);
  } catch (error) {
    console.error("Failed to set driver token:", error);
  }
}

export async function getDriverBalance(): Promise<number> {
  try {
    const balance = await AsyncStorage.getItem(KEYS.DRIVER_BALANCE);
    return balance ? parseInt(balance, 10) : 70;
  } catch (error) {
    console.error("Failed to get driver balance:", error);
    return 70;
  }
}

export async function setDriverBalance(balance: number): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.DRIVER_BALANCE, balance.toString());
  } catch (error) {
    console.error("Failed to set driver balance:", error);
  }
}

export async function addToBalance(points: number): Promise<number> {
  const currentBalance = await getDriverBalance();
  const newBalance = currentBalance + points;
  await setDriverBalance(newBalance);
  return newBalance;
}

export async function getCurrentLoad(): Promise<Load | null> {
  try {
    const loadData = await AsyncStorage.getItem(KEYS.CURRENT_LOAD);
    return loadData ? JSON.parse(loadData) : null;
  } catch (error) {
    console.error("Failed to get current load:", error);
    return null;
  }
}

export async function setCurrentLoad(load: Load | null): Promise<void> {
  try {
    if (load) {
      await AsyncStorage.setItem(KEYS.CURRENT_LOAD, JSON.stringify(load));
    } else {
      await AsyncStorage.removeItem(KEYS.CURRENT_LOAD);
    }
  } catch (error) {
    console.error("Failed to set current load:", error);
  }
}

export async function getCompletedLoads(): Promise<Load[]> {
  try {
    const loadsData = await AsyncStorage.getItem(KEYS.COMPLETED_LOADS);
    return loadsData ? JSON.parse(loadsData) : [];
  } catch (error) {
    console.error("Failed to get completed loads:", error);
    return [];
  }
}

export async function addCompletedLoad(load: Load): Promise<void> {
  try {
    const completedLoads = await getCompletedLoads();
    completedLoads.unshift(load);
    await AsyncStorage.setItem(KEYS.COMPLETED_LOADS, JSON.stringify(completedLoads));
  } catch (error) {
    console.error("Failed to add completed load:", error);
  }
}

export async function getLogs(): Promise<LogEntry[]> {
  try {
    const logsData = await AsyncStorage.getItem(KEYS.LOGS);
    return logsData ? JSON.parse(logsData) : [];
  } catch (error) {
    console.error("Failed to get logs:", error);
    return [];
  }
}

export async function addLog(entry: Omit<LogEntry, "id" | "timestamp">): Promise<void> {
  try {
    const logs = await getLogs();
    const newEntry: LogEntry = {
      ...entry,
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
    };
    logs.unshift(newEntry);
    await AsyncStorage.setItem(KEYS.LOGS, JSON.stringify(logs.slice(0, 100)));
  } catch (error) {
    console.error("Failed to add log:", error);
  }
}

export async function clearLogs(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.LOGS);
  } catch (error) {
    console.error("Failed to clear logs:", error);
  }
}

export async function isLocationEnabled(): Promise<boolean> {
  try {
    const enabled = await AsyncStorage.getItem(KEYS.LOCATION_ENABLED);
    return enabled === "true";
  } catch (error) {
    console.error("Failed to get location status:", error);
    return false;
  }
}

export async function setLocationEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.LOCATION_ENABLED, enabled.toString());
  } catch (error) {
    console.error("Failed to set location status:", error);
  }
}

export async function getTruckSetupComplete(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(KEYS.TRUCK_SETUP_COMPLETE);
    return val === "true";
  } catch {
    return false;
  }
}

export async function setTruckSetupComplete(complete: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.TRUCK_SETUP_COMPLETE, complete.toString());
  } catch (error) {
    console.error("Failed to set truck setup complete:", error);
  }
}

export async function getTruckNumber(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEYS.TRUCK_NUMBER);
  } catch {
    return null;
  }
}

export async function setTruckNumber(number: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.TRUCK_NUMBER, number);
  } catch (error) {
    console.error("Failed to set truck number:", error);
  }
}

export async function getCompanyId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEYS.COMPANY_ID);
  } catch {
    return null;
  }
}

export async function setCompanyId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.COMPANY_ID, id);
  } catch (error) {
    console.error("Failed to set company id:", error);
  }
}

export async function getDriverName(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEYS.DRIVER_NAME);
  } catch {
    return null;
  }
}

export async function setDriverName(name: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.DRIVER_NAME, name);
  } catch (error) {
    console.error("Failed to set driver name:", error);
  }
}

export async function getTruckId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEYS.TRUCK_ID);
  } catch {
    return null;
  }
}

export async function setTruckId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.TRUCK_ID, id);
  } catch (error) {
    console.error("Failed to set truck id:", error);
  }
}

export async function getTruckToken(): Promise<string | null> {
  try {
    const t = await AsyncStorage.getItem(KEYS.TRUCK_TOKEN);
    if (!t || t === "undefined" || t === "null") return null;
    return t;
  } catch {
    return null;
  }
}

export async function setTruckToken(token: string): Promise<void> {
  try {
    if (!token || token === "undefined" || token === "null") return;
    await AsyncStorage.setItem(KEYS.TRUCK_TOKEN, token);
  } catch (error) {
    console.error("Failed to set truck token:", error);
  }
}

export async function getCompanyName(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEYS.COMPANY_NAME);
  } catch {
    return null;
  }
}

export async function setCompanyName(name: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.COMPANY_NAME, name);
  } catch (error) {
    console.error("Failed to set company name:", error);
  }
}

// Wipe everything tied to the current truck/driver session — used by
// "Switch truck" in Settings to drop the user back at the picker flow.
export async function clearTruckSession(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      KEYS.TRUCK_TOKEN,
      KEYS.DRIVER_TOKEN,
      KEYS.TRUCK_ID,
      KEYS.TRUCK_NUMBER,
      KEYS.COMPANY_ID,
      KEYS.COMPANY_NAME,
      KEYS.DRIVER_NAME,
      KEYS.TRUCK_SETUP_COMPLETE,
      KEYS.CURRENT_LOAD,
    ]);
  } catch (error) {
    console.error("Failed to clear truck session:", error);
  }
}
