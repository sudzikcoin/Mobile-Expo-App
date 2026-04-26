import React, { useState, useCallback, useEffect } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import DashboardHeader from "@/components/DashboardHeader";
import LoadCard from "@/components/LoadCard";
import StopCard from "@/components/StopCard";
import RewardAnimation from "@/components/RewardAnimation";
import TrackingDiagnostics from "@/components/TrackingDiagnostics";
import { PingPointColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { isStopCurrent } from "@/lib/mock-data";
import { useDriver } from "@/lib/driver-context";
import { useAppTheme } from "@/lib/theme-context";
import { useIOSiXTelemetry } from "@/lib/iosix/hook";
import type { DrawerParamList } from "@/navigation/DrawerNavigator";

type DashboardRouteProp = RouteProp<DrawerParamList, "Dashboard">;

export default function DashboardScreen() {
  const route = useRoute<DashboardRouteProp>();
  const insets = useSafeAreaInsets();
  const { colors, isArcade } = useAppTheme();

  const {
    token,
    isLoading,
    error,
    load,
    balance,
    isLocationEnabled,
    isLocationLoading,
    isLocationDenied,
    lastPingTime,
    refreshLoad,
    toggleLocation,
    openSettings,
    handleStopAction,
    setToken,
  } = useDriver();

  const iosix = useIOSiXTelemetry(true);

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const routeToken = route.params?.token;
    if (routeToken && routeToken !== token) {
      console.log("[Dashboard] Setting token from route params:", routeToken);
      setToken(routeToken);
    }
  }, [route.params?.token, token, setToken]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      refreshLoad();
    }, 30000);
    return () => clearInterval(interval);
  }, [token, refreshLoad]);
  const [rewardPoints, setRewardPoints] = useState(0);
  const [showReward, setShowReward] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshLoad();
    setRefreshing(false);
  }, [refreshLoad]);

  const handleToggleLocation = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await toggleLocation();
    
    if (!isLocationEnabled) {
      setRewardPoints(10);
      setShowReward(true);
    }
  };

  const onStopAction = async (stopId: string, action: "arrive" | "depart") => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setActionLoading(stopId);
    const result = await handleStopAction(stopId, action);
    setActionLoading(null);

    if (result.success && result.pointsAwarded > 0) {
      setRewardPoints(result.pointsAwarded);
      setShowReward(true);
    }
  };

  const handleRewardComplete = () => {
    setShowReward(false);
    setRewardPoints(0);
  };

  const getTimeSinceLastPing = (): string => {
    if (!lastPingTime) return "";
    const seconds = Math.floor((Date.now() - lastPingTime.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  if (!token || (isLoading && !load)) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <DashboardHeader balance={balance} />
        <View style={styles.loadingContainer}>
          <ThemedText style={[styles.loadingText, { color: colors.textSecondary }]}>Loading your assignment...</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <DashboardHeader balance={balance} />

      {error ? (
        <View style={styles.errorBanner}>
          <Feather name="alert-circle" size={16} color={PingPointColors.yellow} />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <Pressable onPress={onRefresh} style={styles.retryButton}>
            <ThemedText style={styles.retryText}>Retry</ThemedText>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PingPointColors.cyan}
            colors={[PingPointColors.cyan]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {load ? (
          <>
            <LoadCard
              load={load}
              isLocationEnabled={isLocationEnabled}
              isLocationLoading={isLocationLoading}
              isLocationDenied={isLocationDenied}
              onToggleLocation={handleToggleLocation}
              onOpenSettings={openSettings}
            />

            {isLocationEnabled ? (
              <View style={[
                styles.gpsIndicator,
                {
                  backgroundColor: isArcade ? "rgba(0, 217, 255, 0.1)" : "rgba(255, 255, 255, 0.05)",
                  borderColor: isArcade ? PingPointColors.cyan : colors.border,
                  borderRadius: colors.borderRadius,
                }
              ]}>
                <View style={styles.gpsStatusRow}>
                  <View style={[styles.gpsDot, { backgroundColor: isArcade ? "#00ff88" : "#ffffff" }]} />
                  <ThemedText style={[styles.gpsStatusText, { color: isArcade ? PingPointColors.cyan : "#ffffff" }]}>GPS Active</ThemedText>
                </View>
                {lastPingTime ? (
                  <ThemedText style={[styles.gpsLastUpdate, { color: colors.textSecondary }]}>
                    Last update: {getTimeSinceLastPing()}
                  </ThemedText>
                ) : null}
              </View>
            ) : null}

            {isLocationEnabled ? <TrackingDiagnostics /> : null}

            <View style={[
              styles.gpsIndicator,
              {
                backgroundColor: isArcade ? "rgba(0, 217, 255, 0.1)" : "rgba(255, 255, 255, 0.05)",
                borderColor: isArcade ? PingPointColors.cyan : colors.border,
                borderRadius: colors.borderRadius,
              }
            ]}>
              <View style={styles.gpsStatusRow}>
                <View
                  style={[
                    styles.gpsDot,
                    {
                      backgroundColor: iosix.connected
                        ? (isArcade ? "#00ff88" : "#ffffff")
                        : iosix.scanning
                        ? "#3498db"
                        : "#7f8c8d",
                    },
                  ]}
                />
                <ThemedText
                  style={[
                    styles.gpsStatusText,
                    { color: isArcade ? PingPointColors.cyan : "#ffffff" },
                  ]}
                  numberOfLines={1}
                >
                  {iosix.connected
                    ? `ELD${iosix.telemetry.rpm !== null ? ` · ${Math.round(iosix.telemetry.rpm)} RPM` : ""}${iosix.telemetry.fuelRateGph !== null ? ` · ${iosix.telemetry.fuelRateGph.toFixed(1)} gal/h` : ""}${iosix.telemetry.batteryVoltage !== null ? ` · ${iosix.telemetry.batteryVoltage.toFixed(1)}V` : ""}`
                    : iosix.scanning
                    ? "Scanning for ELD..."
                    : iosix.error === "ble_permission_denied"
                    ? "ELD: Bluetooth permission denied"
                    : "ELD Not Connected"}
                </ThemedText>
              </View>
            </View>

            <View style={styles.stopsSection}>
              <ThemedText style={[styles.sectionTitle, { color: colors.textMuted }]}>STOPS</ThemedText>
              <View style={styles.stopsList}>
                {load.stops.map((stop) => (
                  <StopCard
                    key={stop.id}
                    stop={stop}
                    isCurrent={isStopCurrent(stop, load.stops)}
                    onAction={onStopAction}
                    isLoading={actionLoading === stop.id}
                  />
                ))}
              </View>
            </View>
          </>
        ) : (
          <View style={styles.noLoadContainer}>
            <ThemedText style={styles.noLoadTitle}>No Active Load</ThemedText>
            <ThemedText style={styles.noLoadText}>
              Pull down to refresh when you have a new assignment.
            </ThemedText>
          </View>
        )}
      </ScrollView>

      <RewardAnimation
        points={rewardPoints}
        visible={showReward}
        onComplete={handleRewardComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PingPointColors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: PingPointColors.textSecondary,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 215, 0, 0.3)",
  },
  errorText: {
    flex: 1,
    ...Typography.small,
    color: PingPointColors.yellow,
  },
  retryButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: PingPointColors.yellow,
  },
  retryText: {
    ...Typography.badge,
    color: PingPointColors.background,
  },
  gpsIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0, 217, 255, 0.1)",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(0, 217, 255, 0.3)",
  },
  gpsIndicatorArcade: {
    borderColor: PingPointColors.cyan,
  },
  gpsStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  gpsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00ff88",
  },
  gpsStatusText: {
    ...Typography.small,
    fontWeight: "600",
    color: PingPointColors.cyan,
  },
  gpsLastUpdate: {
    ...Typography.caption,
    color: PingPointColors.textSecondary,
  },
  stopsSection: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: PingPointColors.textMuted,
    letterSpacing: 2,
    marginBottom: Spacing.xs,
  },
  stopsList: {
    gap: Spacing.md,
  },
  noLoadContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["5xl"],
  },
  noLoadTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: PingPointColors.textSecondary,
    marginBottom: Spacing.md,
  },
  noLoadText: {
    fontSize: 16,
    color: PingPointColors.textMuted,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
});
