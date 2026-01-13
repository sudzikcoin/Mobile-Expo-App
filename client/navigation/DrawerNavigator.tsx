import React from "react";
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItemList,
  DrawerContentComponentProps,
} from "@react-navigation/drawer";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DashboardScreen from "@/screens/DashboardScreen";
import HistoryScreen from "@/screens/HistoryScreen";
import LogsScreen from "@/screens/LogsScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import { PingPointColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { useAppTheme } from "@/lib/theme-context";

export type DrawerParamList = {
  Dashboard: undefined;
  History: undefined;
  Logs: undefined;
  Settings: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();

function CustomDrawerContent(props: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();
  const { appTheme } = useAppTheme();

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
      <DrawerItemList {...props} />
    </DrawerContentScrollView>
  );
}

export default function DrawerNavigator() {
  const { appTheme } = useAppTheme();
  const isArcade = appTheme === "arcade";

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
          width: 280,
        },
        drawerActiveTintColor: PingPointColors.cyan,
        drawerInactiveTintColor: PingPointColors.textSecondary,
        drawerActiveBackgroundColor: isArcade
          ? "rgba(0, 217, 255, 0.15)"
          : "rgba(0, 217, 255, 0.1)",
        drawerItemStyle: {
          borderRadius: BorderRadius.sm,
          marginHorizontal: Spacing.sm,
          marginVertical: Spacing.xs,
        },
        drawerLabelStyle: {
          ...Typography.body,
          fontWeight: "600",
          marginLeft: -Spacing.lg,
        },
      }}
    >
      <Drawer.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          drawerLabel: "Dashboard",
          drawerIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="History"
        component={HistoryScreen}
        options={{
          drawerLabel: "History",
          drawerIcon: ({ color, size }) => (
            <Feather name="clock" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="Logs"
        component={LogsScreen}
        options={{
          drawerLabel: "Logs",
          drawerIcon: ({ color, size }) => (
            <Feather name="file-text" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          drawerLabel: "Settings",
          drawerIcon: ({ color, size }) => (
            <Feather name="settings" size={size} color={color} />
          ),
        }}
      />
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  drawerContent: {
    flex: 1,
  },
  drawerHeader: {
    paddingHorizontal: Spacing.xl,
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
    ...Typography.badge,
    color: PingPointColors.cyan,
  },
});
