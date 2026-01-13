import AsyncStorage from "@react-native-async-storage/async-storage";
import { DriverData, LogEntry, Load } from "./types";

const KEYS = {
  DRIVER_TOKEN: "@pingpoint_driver_token",
  DRIVER_BALANCE: "@pingpoint_driver_balance",
  CURRENT_LOAD: "@pingpoint_current_load",
  COMPLETED_LOADS: "@pingpoint_completed_loads",
  LOGS: "@pingpoint_logs",
  LOCATION_ENABLED: "@pingpoint_location_enabled",
};

export async function getDriverToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEYS.DRIVER_TOKEN);
  } catch (error) {
    console.error("Failed to get driver token:", error);
    return null;
  }
}

export async function setDriverToken(token: string): Promise<void> {
  try {
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
