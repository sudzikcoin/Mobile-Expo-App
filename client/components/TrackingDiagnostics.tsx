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
      {/* Single compact row: three inline values instead of three rows —
          this is secondary status, it shouldn't cost fold space. */}
      <View style={styles.row}>
        <View style={styles.inlinePair}>
          <ThemedText style={[styles.label, { color: colors.textSecondary }]}>State </ThemedText>
          <ThemedText style={[styles.value, { color: stateColor }]}>{stateLabel}</ThemedText>
        </View>
        <View style={styles.inlinePair}>
          <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Pending </ThemedText>
          <ThemedText style={[styles.value, { color: colors.textPrimary }]}>{diag.pendingPings}</ThemedText>
        </View>
        <View style={styles.inlinePair}>
          <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Filter </ThemedText>
          <ThemedText style={[styles.value, { color: colors.textPrimary }]}>
            {diag.state.distanceFilter ?? "—"} m
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  inlinePair: {
    flexDirection: "row",
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
