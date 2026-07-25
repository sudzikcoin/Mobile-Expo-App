import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KM_PER_MI } from "./units";

// Display-level unit preference (Settings → Units). Storage and the wire
// stay km (the ELD's native unit, see lib/units.ts) — this context only
// decides how numbers are FORMATTED for the driver. Default mi (US market).

export type AppUnits = "mi" | "km";

const UNITS_KEY = "@pingpoint_units";

interface UnitsContextType {
  units: AppUnits;
  setUnits: (u: AppUnits) => Promise<void>;
  // kph in → localized whole-number speed string out ("62 mph" / "100 km/h").
  formatSpeedKph: (kph: number) => string;
  speedUnitLabel: string;
}

const UnitsContext = createContext<UnitsContextType | undefined>(undefined);

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [units, setUnitsState] = useState<AppUnits>("mi");

  useEffect(() => {
    AsyncStorage.getItem(UNITS_KEY)
      .then((saved) => {
        if (saved === "mi" || saved === "km") setUnitsState(saved);
      })
      .catch(() => {});
  }, []);

  const setUnits = useCallback(async (u: AppUnits) => {
    try {
      await AsyncStorage.setItem(UNITS_KEY, u);
      setUnitsState(u);
    } catch (e) {
      console.error("[Units] Failed to persist units:", e);
    }
  }, []);

  const speedUnitLabel = units === "km" ? "km/h" : "mph";
  const formatSpeedKph = useCallback(
    (kph: number) => {
      const v = units === "km" ? kph : kph / KM_PER_MI;
      return `${Math.round(v)} ${units === "km" ? "km/h" : "mph"}`;
    },
    [units],
  );

  return (
    <UnitsContext.Provider
      value={{ units, setUnits, formatSpeedKph, speedUnitLabel }}
    >
      {children}
    </UnitsContext.Provider>
  );
}

export function useUnits(): UnitsContextType {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error("useUnits must be used within a UnitsProvider");
  return ctx;
}
