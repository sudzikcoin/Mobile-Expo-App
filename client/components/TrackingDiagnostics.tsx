import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";
import {
  getDiagnostics,
  type TrackingDiagnostics as TrackingDiag,
} from "@/lib/transistorsoftTracking";

const POLL_MS = 30_000;

function describeState(diag: TrackingDiag): string {
  if (!diag.state.enabled) return "DISABLED";
  if (diag.state.isMoving) return "TRACKING";
  return "STATIONARY";
}

export default function TrackingDiagnostics() {
  const { colors, isArcade } = useAppTheme();
  const [diag, setDiag] = useState<TrackingDiag | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const d = await getDiagnostics();
        if (!cancelled) {
          setDiag(d);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    };
    tick();
    const interval = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (error) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: isArcade ? "rgba(0, 217, 255, 0.05)" : "rgba(255, 255, 255, 0.03)",
            borderColor: colors.border,
          },
        ]}
      >
        <ThemedText style={[styles.label, { color: colors.textMuted }]}>
          Tracking diagnostics unavailable
        </ThemedText>
      </View>
    );
  }

  if (!diag) return null;

  const stateLabel = describeState(diag);
  const stateColor =
    stateLabel === "TRACKING"
      ? PingPointColors.cyan
      : stateLabel === "STATIONARY"
      ? "#ffaa00"
      : colors.textMuted;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isArcade ? "rgba(0, 217, 255, 0.05)" : "rgba(255, 255, 255, 0.03)",
          borderColor: colors.border,
          borderRadius: colors.borderRadius,
        },
      ]}
    >
      <View style={styles.row}>
        <ThemedText style={[styles.label, { color: colors.textSecondary }]}>State</ThemedText>
        <ThemedText style={[styles.value, { color: stateColor }]}>{stateLabel}</ThemedText>
      </View>
      <View style={styles.row}>
        <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Pending pings</ThemedText>
        <ThemedText style={[styles.value, { color: colors.textPrimary }]}>
          {diag.pendingPings}
        </ThemedText>
      </View>
      <View style={styles.row}>
        <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Distance filter</ThemedText>
        <ThemedText style={[styles.value, { color: colors.textPrimary }]}>
          {diag.state.distanceFilter ?? "—"} m
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.md,
    borderWidth: 1,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    ...Typography.small,
  },
  value: {
    ...Typography.small,
    fontWeight: "600",
  },
});
