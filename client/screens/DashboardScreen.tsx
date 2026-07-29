import React, { useState, useCallback, useEffect } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Platform, Pressable, Linking, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import DashboardHeader from "@/components/DashboardHeader";
import LoadCard from "@/components/LoadCard";
import StopCard from "@/components/StopCard";
import RewardAnimation from "@/components/RewardAnimation";
import TrackingDiagnostics from "@/components/TrackingDiagnostics";
import LoadSelectorStrip from "@/components/LoadSelectorStrip";
import EldStatusPill from "@/components/EldStatusPill";
import BrokerInviteBanner from "@/components/BrokerInviteBanner";
import { PingPointColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { isStopCurrent } from "@/lib/mock-data";
import { buildTruckerPathLoadLink } from "@/lib/truckerpath";
import { buildSimpleGoogleLink, fetchGoogleTruckRoute } from "@/lib/navroute";
import { useDriver } from "@/lib/driver-context";
import { maskToken } from "@/lib/storage";
import { useAppTheme } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n";
import type { DrawerParamList } from "@/navigation/DrawerNavigator";

type DashboardRouteProp = RouteProp<DrawerParamList, "Dashboard">;

export default function DashboardScreen() {
  const route = useRoute<DashboardRouteProp>();
  const insets = useSafeAreaInsets();
  const { colors, isArcade } = useAppTheme();
  const { t } = useI18n();

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

  // Telemetry lives inside EldStatusPill now: BLE ticks re-render only the
  // pill. Keeping the subscription out of this component is what prevents
  // the screen-wide re-render storm — do not lift it back up here.
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const routeToken = route.params?.token;
    if (routeToken && routeToken !== token) {
      console.log("[Dashboard] Setting token from route params:", maskToken(routeToken));
      setToken(routeToken);
    }
  }, [route.params?.token, token, setToken]);

  // Load polling moved to DriverProvider so it runs on every screen, not
  // just while the Dashboard is mounted. Pull-to-refresh below stays.
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

  const onStopAction = useCallback(async (stopId: string, action: "arrive" | "depart") => {
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
  }, [handleStopAction]);

  // Stable identity matters: RewardAnimation keeps its dismiss timer across
  // re-renders, and memoized StopCards skip re-rendering on unrelated state.
  const handleRewardComplete = useCallback(() => {
    setShowReward(false);
    setRewardPoints(0);
  }, []);

  // Hidden when there's no load or nothing left to drive; disabled (never
  // hidden) if a remaining stop lacks coordinates so the miss is visible.
  const tpLink = load ? buildTruckerPathLoadLink(load) : { state: "no-remaining" as const };

  const handleOpenTruckerPath = async () => {
    if (tpLink.state !== "ready") return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    try {
      // Direct openURL, no canOpenURL gate — canOpenURL lies unless the
      // scheme is declared (LSApplicationQueriesSchemes / <queries>), openURL
      // itself works regardless. Same lesson as the NAV WebView handoff.
      await Linking.openURL(tpLink.url);
    } catch {
      Alert.alert(t("dash.tpNotInstalled"));
    }
  };

  // Google Maps goes through the NAV routing engine: origin is always the
  // truck's live position and stops are always the pending ones, so a re-tap
  // anywhere mid-trip rebuilds the route from wherever the truck is now.
  const [gmapsBuilding, setGmapsBuilding] = useState(false);

  const offerSimpleGoogleFallback = () => {
    const simpleUrl = load ? buildSimpleGoogleLink(load) : null;
    if (!simpleUrl) {
      Alert.alert(t("dash.routeEngineTitle"), t("dash.routeEngineRetry"));
      return;
    }
    Alert.alert(
      t("dash.routeEngineTitle"),
      t("dash.routeEngineFallback"),
      [
        { text: t("dash.cancel"), style: "cancel" },
        {
          text: t("dash.openAnyway"),
          onPress: () => {
            Linking.openURL(simpleUrl).catch(() => {});
          },
        },
      ],
    );
  };

  const handleOpenGoogleMaps = async () => {
    if (tpLink.state !== "ready" || !load || gmapsBuilding) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setGmapsBuilding(true);
    try {
      // The engine needs a real origin; without a GPS fix the only honest
      // option is the stops-only fallback (Google fills in "My Location").
      const fgPerm = await Location.getForegroundPermissionsAsync();
      if (fgPerm.status !== "granted") {
        offerSimpleGoogleFallback();
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const result = await fetchGoogleTruckRoute(load, {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      if (result.state !== "ready") {
        offerSimpleGoogleFallback();
        return;
      }
      try {
        await Linking.openURL(result.url);
      } catch {
        Alert.alert(t("dash.gmapsCantOpen"));
      }
    } catch {
      offerSimpleGoogleFallback();
    } finally {
      setGmapsBuilding(false);
    }
  };

  const getTimeSinceLastPing = (): string => {
    if (!lastPingTime) return "";
    const seconds = Math.floor((Date.now() - lastPingTime.getTime()) / 1000);
    if (seconds < 60) return t("time.sAgo", { n: seconds });
    const minutes = Math.floor(seconds / 60);
    return t("time.mAgo", { n: minutes });
  };

  if (!token || (isLoading && !load)) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <DashboardHeader balance={balance} />
        <View style={styles.loadingContainer}>
          <ThemedText style={[styles.loadingText, { color: colors.textSecondary }]}>{t("dash.loading")}</ThemedText>
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
            <ThemedText style={styles.retryText}>{t("dash.retry")}</ThemedText>
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
        <BrokerInviteBanner />
        {/* Renders nothing unless >= 2 loads are active at once. */}
        <LoadSelectorStrip />
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
                  <ThemedText style={[styles.gpsStatusText, { color: isArcade ? PingPointColors.cyan : "#ffffff" }]}>{t("dash.gpsActive")}</ThemedText>
                </View>
                {lastPingTime ? (
                  <ThemedText style={[styles.gpsLastUpdate, { color: colors.textSecondary }]}>
                    {t("dash.lastUpdate", { time: getTimeSinceLastPing() })}
                  </ThemedText>
                ) : null}
              </View>
            ) : null}

            {isLocationEnabled ? <TrackingDiagnostics /> : null}

            <EldStatusPill />

            <View style={styles.stopsSection}>
              <ThemedText style={[styles.sectionTitle, { color: colors.textMuted }]}>{t("dash.stops")}</ThemedText>
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

            {tpLink.state !== "no-remaining" ? (
              <View>
                <Pressable
                  onPress={handleOpenTruckerPath}
                  disabled={tpLink.state !== "ready"}
                  style={({ pressed }) => [
                    styles.tpButton,
                    {
                      borderColor: isArcade ? PingPointColors.cyan : "rgba(0, 217, 255, 0.5)",
                      borderRadius: colors.borderRadius,
                    },
                    tpLink.state !== "ready" && styles.tpButtonDisabled,
                    pressed && styles.tpButtonPressed,
                  ]}
                >
                  <Feather
                    name="truck"
                    size={20}
                    color={tpLink.state === "ready" ? PingPointColors.cyan : PingPointColors.textMuted}
                  />
                  <ThemedText
                    style={[
                      styles.tpButtonText,
                      tpLink.state !== "ready" && { color: PingPointColors.textMuted },
                    ]}
                  >
                    {t("dash.openTp")}
                  </ThemedText>
                </Pressable>
                {tpLink.state === "missing-coords" ? (
                  <ThemedText style={[styles.tpNote, { color: colors.textMuted }]}>
                    {t("dash.stopCoordsMissing")}
                  </ThemedText>
                ) : null}

                <Pressable
                  onPress={handleOpenGoogleMaps}
                  disabled={tpLink.state !== "ready" || gmapsBuilding}
                  style={({ pressed }) => [
                    styles.tpButton,
                    styles.gmapsButton,
                    {
                      borderColor: isArcade ? PingPointColors.cyan : "rgba(0, 217, 255, 0.5)",
                      borderRadius: colors.borderRadius,
                    },
                    tpLink.state !== "ready" && styles.tpButtonDisabled,
                    pressed && styles.tpButtonPressed,
                  ]}
                >
                  <Feather
                    name="map"
                    size={20}
                    color={tpLink.state === "ready" ? PingPointColors.cyan : PingPointColors.textMuted}
                  />
                  <ThemedText
                    style={[
                      styles.tpButtonText,
                      tpLink.state !== "ready" && { color: PingPointColors.textMuted },
                    ]}
                  >
                    {gmapsBuilding ? t("dash.buildingRoute") : t("dash.openGmaps")}
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.noLoadContainer}>
            <ThemedText style={styles.noLoadTitle}>{t("dash.noLoadTitle")}</ThemedText>
            <ThemedText style={styles.noLoadText}>
              {t("dash.noLoadText")}
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
  // Tighter vertical rhythm (chrome, not tap targets) so the pending stop
  // and the TP button sit above the fold on a 390x844 phone. maxWidth keeps
  // line lengths sane on the 800+px fleet tablet.
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
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
  // Status pill, not a tap target — 48px keeps the fold budget in check.
  gpsIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0, 217, 255, 0.1)",
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
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
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: PingPointColors.textMuted,
    letterSpacing: 2,
  },
  stopsList: {
    gap: Spacing.sm,
  },
  // In-cab standard: full-width, ≥56px target, cyan-outline family (matches
  // the ELD/GPS pills; NAV uses the same treatment for its primary CTAs).
  tpButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    minHeight: 56,
    paddingHorizontal: Spacing.lg,
    backgroundColor: "rgba(0, 217, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(0, 217, 255, 0.5)",
  },
  gmapsButton: {
    marginTop: Spacing.sm,
  },
  tpButtonPressed: {
    backgroundColor: "rgba(0, 217, 255, 0.25)",
  },
  tpButtonDisabled: {
    opacity: 0.45,
  },
  tpButtonText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
    color: PingPointColors.cyan,
  },
  tpNote: {
    ...Typography.caption,
    marginTop: Spacing.xs,
    textAlign: "center",
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
