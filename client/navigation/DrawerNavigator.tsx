import React from "react";
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerContentComponentProps,
} from "@react-navigation/drawer";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import DashboardScreen from "@/screens/DashboardScreen";
import HistoryScreen from "@/screens/HistoryScreen";
import HistoryDetailScreen from "@/screens/HistoryDetailScreen";
import LogsScreen from "@/screens/LogsScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import LoadDetailsScreen from "@/screens/LoadDetailsScreen";
import TrackingStatusScreen from "@/screens/TrackingStatusScreen";
import NavScreen from "@/screens/NavScreen";
import StatusScreen from "@/screens/StatusScreen";
import IftaScreen from "@/screens/IftaScreen";
import LegalScreen from "@/screens/LegalScreen";
import { PingPointColors, Spacing, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { useAppTheme } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n";
import type { Load } from "@/lib/types";

export type DrawerParamList = {
  Dashboard: { token?: string } | undefined;
  // loadId опционален — если не передан, экран возьмёт id текущего активного груза из driver-context
  LoadDetails: { loadId?: string } | undefined;
  History: undefined;
  // Detail view for a delivered load; fed from the already-fetched history
  // payload (no extra fetch).
  HistoryDetail: { load: Load };
  Logs: undefined;
  Settings: undefined;
  TrackingStatus: undefined;
  Nav: undefined;
  Status: undefined;
  Ifta: undefined;
  Legal: { url: string; title: string };
};

const Drawer = createDrawerNavigator<DrawerParamList>();

// The five menu entries, in order. Per-item neon accent from the arcade
// palette (same colors the status pills use); everything else registered on
// the navigator stays reachable by navigation but is NOT listed here —
// Logs and TrackingStatus moved behind the Settings service door in 1.8.6,
// LoadDetails/HistoryDetail/Legal are detail views, not destinations.
const MENU_ITEMS: Array<{
  route: keyof DrawerParamList;
  labelKey: string;
  icon: keyof typeof Feather.glyphMap;
  accent: string;
}> = [
  { route: "Dashboard", labelKey: "menu.dashboard", icon: "home", accent: PingPointColors.cyan },
  // "History" route hosts the Loads screen since 1.9.0 (Active / Waiting /
  // Delivered); route name kept to avoid churn in navigation references.
  { route: "History", labelKey: "menu.loads", icon: "package", accent: PingPointColors.yellow },
  { route: "Status", labelKey: "menu.status", icon: "activity", accent: "#00ff88" },
  { route: "Ifta", labelKey: "menu.ifta", icon: "percent", accent: "#ffd700" },
  { route: "Nav", labelKey: "menu.nav", icon: "truck", accent: PingPointColors.magenta },
  { route: "Settings", labelKey: "menu.settings", icon: "settings", accent: PingPointColors.purple },
];

function DrawerItem({
  label,
  icon,
  accent,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  accent: string;
  active: boolean;
  onPress: () => void;
}) {
  const { isArcade, colors } = useAppTheme();

  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.item,
        {
          borderRadius: BorderRadius.md,
          borderColor: active ? accent : "transparent",
          backgroundColor: active ? `${accent}26` : "transparent",
        },
        // Active item glows like the ARCADE 90s card in Settings.
        active &&
          isArcade && {
            shadowColor: accent,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.55,
            shadowRadius: 10,
            elevation: 8,
          },
        pressed && { opacity: 0.75 },
      ]}
    >
      <View
        style={[
          styles.itemIcon,
          {
            backgroundColor: `${accent}1f`,
          },
          active &&
            isArcade && {
              shadowColor: accent,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.7,
              shadowRadius: 6,
              elevation: 4,
            },
        ]}
      >
        <Feather name={icon} size={22} color={accent} />
      </View>
      <ThemedText
        style={[
          styles.itemLabel,
          { color: active ? accent : colors.textSecondary },
        ]}
        numberOfLines={1}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

function CustomDrawerContent(props: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();
  const { appTheme } = useAppTheme();
  const { t } = useI18n();

  const activeRoute = props.state.routes[props.state.index]?.name;

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={[
        styles.drawerContent,
        { paddingTop: insets.top + Spacing.lg },
      ]}
    >
      <View style={styles.drawerHeader}>
        <ThemedText style={styles.drawerTitle}>PINGPOINT</ThemedText>
        <ThemedText style={styles.drawerSubtitle}>DRIVER</ThemedText>
        <View style={styles.themeBadge}>
          <ThemedText style={styles.themeBadgeText}>
            {appTheme === "arcade" ? "ARCADE 90s" : "PREMIUM"}
          </ThemedText>
        </View>
      </View>
      {MENU_ITEMS.map((item) => (
        <DrawerItem
          key={item.route}
          label={t(item.labelKey)}
          icon={item.icon}
          accent={item.accent}
          active={activeRoute === item.route}
          onPress={() => props.navigation.navigate(item.route as never)}
        />
      ))}
    </DrawerContentScrollView>
  );
}

export default function DrawerNavigator() {
  return (
    <Drawer.Navigator
      initialRouteName="Dashboard"
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        drawerPosition: "right",
        drawerType: "front",
        headerShown: false,
        drawerStyle: {
          backgroundColor: PingPointColors.surface,
          width: 300,
        },
      }}
    >
      <Drawer.Screen name="Dashboard" component={DashboardScreen} />
      <Drawer.Screen name="History" component={HistoryScreen} />
      <Drawer.Screen name="HistoryDetail" component={HistoryDetailScreen} />
      <Drawer.Screen
        name="Status"
        component={StatusScreen}
        options={{
          // Same as Nav below: the telemetry page lives in a WebView, and a
          // frozen WebView comes back as a black surface on Android when the
          // drawer re-shows the kept-mounted screen. Keep it unfrozen.
          freezeOnBlur: false,
        }}
      />
      <Drawer.Screen
        name="Ifta"
        component={IftaScreen}
        options={{
          // WebView screen like Status/Nav: upload + mapping state lives in
          // the page; freeze would black the surface on drawer re-show.
          freezeOnBlur: false,
        }}
      />
      <Drawer.Screen
        name="Nav"
        component={NavScreen}
        options={{
          // NAV state (parsed RC, built route) lives in the WebView — the
          // drawer keeps visited screens mounted, and freeze is off so the
          // WebView keeps its session while the user is elsewhere in the app.
          freezeOnBlur: false,
        }}
      />
      <Drawer.Screen name="Settings" component={SettingsScreen} />
      <Drawer.Screen name="Legal" component={LegalScreen} />
      {/* Not in the menu: LoadDetails is the commercial load view (opened
          from dispatch deep links /loads/:loadId); Logs and TrackingStatus
          are service-door screens reached from Settings → Advanced. */}
      <Drawer.Screen
        name="LoadDetails"
        component={LoadDetailsScreen}
        options={{ swipeEnabled: true }}
      />
      <Drawer.Screen name="Logs" component={LogsScreen} />
      <Drawer.Screen name="TrackingStatus" component={TrackingStatusScreen} />
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  drawerContent: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  drawerHeader: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing["2xl"],
    borderBottomWidth: 1,
    borderBottomColor: PingPointColors.border,
    marginBottom: Spacing.lg,
  },
  drawerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: PingPointColors.cyan,
    letterSpacing: 2,
  },
  drawerSubtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: PingPointColors.textSecondary,
    letterSpacing: 4,
    marginTop: -4,
  },
  themeBadge: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: "rgba(0, 217, 255, 0.1)",
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: PingPointColors.cyan,
    alignSelf: "flex-start",
  },
  themeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: PingPointColors.cyan,
  },
  // In-cab standard: ≥56px target, 17px label, clear icon/label separation.
  item: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 60,
    paddingHorizontal: Spacing.md,
    marginVertical: Spacing.xs,
    borderWidth: 1,
    gap: Spacing.lg,
  },
  itemIcon: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  itemLabel: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.5,
    flex: 1,
  },
});
