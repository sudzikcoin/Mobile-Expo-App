import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppTheme } from "@/constants/theme";

const THEME_STORAGE_KEY = "@pingpoint_theme";

interface ThemeContextType {
  appTheme: AppTheme;
  setAppTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appTheme, setAppThemeState] = useState<AppTheme>("arcade");

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === "arcade" || savedTheme === "premium") {
        setAppThemeState(savedTheme);
      }
    } catch (error) {
      console.error("Failed to load theme:", error);
    }
  };

  const setAppTheme = async (theme: AppTheme) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, theme);
      setAppThemeState(theme);
    } catch (error) {
      console.error("Failed to save theme:", error);
    }
  };

  const toggleTheme = () => {
    setAppTheme(appTheme === "arcade" ? "premium" : "arcade");
  };

  return (
    <ThemeContext.Provider value={{ appTheme, setAppTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useAppTheme must be used within a ThemeProvider");
  }
  return context;
}
