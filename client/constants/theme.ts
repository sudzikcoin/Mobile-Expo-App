import { Platform } from "react-native";

export type AppTheme = "arcade" | "premium";

const cyanPrimary = "#00d9ff";
const yellowSecondary = "#ffd700";
const magentaAccent = "#ff00ff";
const purpleAccent = "#9d4edd";

export const PingPointColors = {
  cyan: cyanPrimary,
  yellow: yellowSecondary,
  magenta: magentaAccent,
  purple: purpleAccent,
  background: "#0a0a1f",
  surface: "#12122a",
  surfaceLight: "#1a1a3a",
  border: "#2a2a4a",
  textPrimary: "#ffffff",
  textSecondary: "#a0a0c0",
  textMuted: "#606080",
  success: cyanPrimary,
  warning: yellowSecondary,
  error: "#ff4444",
};

export const ArcadeTheme = {
  background: "#0a0a1f",
  surface: "#12122a",
  surfaceLight: "#1a1a3a",
  border: "#2a2a4a",
  borderActive: cyanPrimary,
  accent: cyanPrimary,
  accentSecondary: yellowSecondary,
  accentGlow: "rgba(0, 217, 255, 0.3)",
  textPrimary: "#ffffff",
  textSecondary: "#a0a0c0",
  textMuted: "#606080",
  cardBorder: "rgba(0, 217, 255, 0.2)",
  cardGlow: true,
  borderRadius: 20,
};

export const PremiumTheme = {
  background: "#0f0f0f",
  surface: "#1a1a1a",
  surfaceLight: "#252525",
  border: "#333333",
  borderActive: "#555555",
  accent: "#ffffff",
  accentSecondary: "#888888",
  accentGlow: "transparent",
  textPrimary: "#ffffff",
  textSecondary: "#b0b0b0",
  textMuted: "#666666",
  cardBorder: "#333333",
  cardGlow: false,
  borderRadius: 12,
};

export type ThemeColors = typeof ArcadeTheme;

export function getThemeColors(theme: AppTheme): ThemeColors {
  return theme === "arcade" ? ArcadeTheme : PremiumTheme;
}

export const Colors = {
  light: {
    text: "#ffffff",
    buttonText: "#0a0a1f",
    tabIconDefault: "#606080",
    tabIconSelected: cyanPrimary,
    link: cyanPrimary,
    backgroundRoot: "#0a0a1f",
    backgroundDefault: "#12122a",
    backgroundSecondary: "#1a1a3a",
    backgroundTertiary: "#2a2a4a",
  },
  dark: {
    text: "#ffffff",
    buttonText: "#0a0a1f",
    tabIconDefault: "#606080",
    tabIconSelected: cyanPrimary,
    link: cyanPrimary,
    backgroundRoot: "#0a0a1f",
    backgroundDefault: "#12122a",
    backgroundSecondary: "#1a1a3a",
    backgroundTertiary: "#2a2a4a",
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  inputHeight: 48,
  buttonHeight: 52,
};

export const BorderRadius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  full: 9999,
};

export const Typography = {
  h1: {
    fontSize: 32,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 24,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 20,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 18,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 14,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: "400" as const,
  },
  button: {
    fontSize: 14,
    fontWeight: "700" as const,
    letterSpacing: 1,
  },
  badge: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
  },
};

export const Shadows = {
  arcade: {
    cyan: {
      shadowColor: cyanPrimary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 8,
      elevation: 8,
    },
    yellow: {
      shadowColor: yellowSecondary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 8,
      elevation: 8,
    },
    magenta: {
      shadowColor: magentaAccent,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 6,
      elevation: 6,
    },
  },
  premium: {
    card: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4,
    },
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
