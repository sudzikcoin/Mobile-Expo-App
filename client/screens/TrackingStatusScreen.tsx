import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import BackgroundGeolocation, {
  ProviderChangeEvent,
} from "react-native-background-geolocation";

import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";
import { useDriver } from "@/lib/driver-context";
import {
  getDiagnostics,
  initTracking,
  stopTracking,
  type TrackingDiagnostics as TrackingDiag,
} from "@/lib/transistorsoftTracking";
import { getTruckId } from "@/lib/storage";

const POLL_MS = 5_000;

interface ProviderInfo {
  enabled: boolean;
  gps: boolean;
  network: boolean;
}

export default function TrackingStatusScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isArcade } = useAppTheme();
  const { token } = useDriver();

  const [diag, setDiag] = useState<TrackingDiag | null>(null);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [restarting, setRestarting] = useState(false);

  const tick = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([
        getDiagnostics(),
        BackgroundGeolocation.getProviderState(),
      ]);
      setDiag(d);
      setProvider({ enabled: p.enabled, gps: p.gps, network: p.network });
    } catch (e) {
      console.warn("[TrackingStatus] tick failed:", e);
    }
  }, []);

  useEffect(() => {
    tick();
    const interval = setInterval(tick, POLL_MS);
    const sub = BackgroundGeolocation.onProviderChange(
      (event: ProviderChangeEvent) => {
        setProvider({
          enabled: event.enabled,
          gps: event.gps,
          network: event.network,
        });
      },
    );
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [tick]);

  const restart = async () => {
    if (!token || restarting) return;
    setRestarting(true);
    try {
      const truckId = await getTruckId();
      if (!truckId) {
        Alert.alert("Cannot restart", "Truck not registered.");
        return;
      }
      await stopTracking();
      await initTracking(token, truckId);
      await tick();
    } catch (e) {
      Alert.alert("Restart failed", String(e));
    } finally {
      setRestarting(false);
    }
  };

  const stateLabel = !diag
    ? "—"
    : !diag.state.enabled
    ? "DISABLED"
    : diag.state.isMoving
    ? "TRACKING"
    : "STATIONARY";

  const stateColor =
    stateLabel === "TRACKING"
      ? PingPointColors.cyan
      : stateLabel === "STATIONARY"
      ? "#ffaa00"
      : colors.textMuted;

  const checklistRows: Array<{
    label: string;
    ok: boolean;
    fix?: () => void;
    fixLabel?: string;
  }> = [
    {
      label: "Location provider enabled (GPS / Network)",
      ok: !!provider?.enabled,
      fix: () => BackgroundGeolocation.openSettings(),
      fixLabel: "Open settings",
    },
    {
      label: "GPS satellite source available",
      ok: !!provider?.gps,
      fix: () => BackgroundGeolocation.openSettings(),
      fixLabel: "Open settings",
    },
    {
      label: "Tracking SDK ready",
      ok: !!diag && diag.state.enabled,
      fix: restart,
      fixLabel: "Restart tracking",
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + Spacing.lg }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText style={styles.heading}>TRACKING STATUS</ThemedText>

        <View style={[styles.card, { borderColor: colors.border, borderRadius: colors.borderRadius }]}>
          <View style={styles.row}>
            <ThemedText style={[styles.label, { color: colors.textSecondary }]}>State</ThemedText>
            <ThemedText style={[styles.value, { color: stateColor }]}>{stateLabel}</ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Pending pings (offline buffer)</ThemedText>
            <ThemedText style={[styles.value, { color: colors.textPrimary }]}>
              {diag?.pendingPings ?? "—"}
            </ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Distance filter</ThemedText>
            <ThemedText style={[styles.value, { color: colors.textPrimary }]}>
              {diag?.state.distanceFilter ?? "—"} m
            </ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Stop timeout</ThemedText>
            <ThemedText style={[styles.value, { color: colors.textPrimary }]}>
              {diag?.state.stopTimeout ?? "—"} min
            </ThemedText>
          </View>
        </View>

        <ThemedText style={styles.sectionTitle}>CHECKLIST</ThemedText>
        <View style={[styles.card, { borderColor: colors.border, borderRadius: colors.borderRadius }]}>
          {checklistRows.map((row, i) => (
            <View key={i} style={styles.checkRow}>
              <Feather
                name={row.ok ? "check-circle" : "alert-triangle"}
                size={18}
                color={row.ok ? PingPointColors.cyan : "#ffaa00"}
              />
              <ThemedText style={[styles.checkLabel, { color: colors.textPrimary }]}>{row.label}</ThemedText>
              {!row.ok && row.fix ? (
                <Pressable onPress={row.fix} style={styles.fixBtn}>
                  <ThemedText style={styles.fixBtnText}>{row.fixLabel ?? "Fix"}</ThemedText>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={restart}
            disabled={restarting}
            style={[
              styles.actionBtn,
              { backgroundColor: PingPointColors.cyan, opacity: restarting ? 0.6 : 1 },
              isArcade && { shadowColor: PingPointColors.cyan, shadowOpacity: 0.5, shadowRadius: 8 },
            ]}
          >
            <Feather name="refresh-cw" size={16} color={PingPointColors.background} />
            <ThemedText style={styles.actionBtnText}>
              {restarting ? "Restarting..." : "Restart tracking"}
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => BackgroundGeolocation.openPowerSettings()}
            style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
          >
            <Feather name="battery-charging" size={16} color={colors.textPrimary} />
            <ThemedText style={[styles.actionBtnText, { color: colors.textPrimary }]}>Power settings</ThemedText>
          </Pressable>
        </View>

        <ThemedText style={styles.sectionTitle}>RECENT LOG</ThemedText>
        <View style={[styles.logCard, { borderColor: colors.border, borderRadius: colors.borderRadius }]}>
          <ThemedText style={[styles.logText, { color: colors.textSecondary }]}>
            {diag?.recentLog || "No log yet."}
          </ThemedText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.xl,
  },
  heading: {
    ...Typography.h3,
    color: PingPointColors.cyan,
    letterSpacing: 2,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.small,
    color: PingPointColors.textMuted,
    letterSpacing: 2,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  card: {
    padding: Spacing.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    ...Typography.small,
    flex: 1,
  },
  value: {
    ...Typography.small,
    fontWeight: "600",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  checkLabel: {
    ...Typography.small,
    flex: 1,
  },
  fixBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(0, 217, 255, 0.15)",
    borderWidth: 1,
    borderColor: PingPointColors.cyan,
  },
  fixBtnText: {
    ...Typography.small,
    color: PingPointColors.cyan,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  actionBtnText: {
    ...Typography.button,
    color: PingPointColors.background,
    fontSize: 13,
  },
  logCard: {
    padding: Spacing.sm,
    borderWidth: 1,
    minHeight: 200,
  },
  logText: {
    fontSize: 10,
    fontFamily: "monospace",
  },
});
