import React, { useState } from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing, BorderRadius, Typography, Shadows } from "@/constants/theme";
import { Stop } from "@/lib/types";
import { formatDateTime, getStopActionLabel, isStopCompleted } from "@/lib/mock-data";
import { useAppTheme } from "@/lib/theme-context";

interface StopCardProps {
  stop: Stop;
  isCurrent: boolean;
  onAction: (stopId: string, action: "arrive" | "depart") => void;
  isLoading?: boolean;
}

function formatTimeShort(isoString: string): string {
  const date = new Date(isoString);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function StopCard({ stop, isCurrent, onAction, isLoading }: StopCardProps) {
  const { colors, isArcade } = useAppTheme();
  const completed = isStopCompleted(stop);
  const actionLabel = getStopActionLabel(stop);
  // Collapsed by default: completed stops render as a slim history row and
  // the address clamps to 2 lines. Tap anywhere on the card body to expand.
  const [expanded, setExpanded] = useState(false);

  const handleAction = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const action = stop.status === "PENDING" ? "arrive" : "depart";
    onAction(stop.id, action);
  };

  const primaryAddress = stop.fullAddress || `${stop.city}${stop.state ? ", " + stop.state : ""}`;

  if (completed && !expanded) {
    // Slim history row: check + short place + departed time. ≥44px row is
    // fine — it's history, not a primary action; tap expands the full card.
    return (
      <Pressable
        onPress={() => setExpanded(true)}
        style={[
          styles.slimRow,
          {
            backgroundColor: colors.surfaceLight,
            borderColor: colors.border,
            borderRadius: colors.borderRadius,
          },
        ]}
      >
        <View style={styles.slimBadge}>
          <Feather name="check" size={12} color={PingPointColors.textPrimary} />
        </View>
        <ThemedText style={styles.slimText} numberOfLines={1}>
          {stop.type === "PICKUP" ? "PU" : "DEL"} · {stop.city}
          {stop.state ? `, ${stop.state}` : ""}
        </ThemedText>
        {stop.departedAt ? (
          <ThemedText style={styles.slimTime}>dep {formatTimeShort(stop.departedAt)}</ThemedText>
        ) : null}
        <Feather name="chevron-down" size={16} color={PingPointColors.textMuted} />
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceLight,
          borderColor: isCurrent ? (isArcade ? PingPointColors.cyan : "#ffffff") : colors.border,
          borderRadius: colors.borderRadius,
        },
        completed && styles.containerCompleted,
        isCurrent && { borderWidth: 2 },
        isCurrent && isArcade && Shadows.arcade.cyan,
      ]}
    >
      <View style={styles.leftSection}>
        <View
          style={[
            styles.sequenceBadge,
            completed && styles.sequenceBadgeCompleted,
            isCurrent && styles.sequenceBadgeCurrent,
          ]}
        >
          {completed ? (
            <Feather name="check" size={14} color={PingPointColors.textPrimary} />
          ) : (
            <ThemedText style={styles.sequenceText}>{stop.sequence}</ThemedText>
          )}
        </View>
      </View>

      <Pressable style={styles.content} onPress={() => setExpanded(!expanded)}>
        <View style={styles.headerRow}>
          <View
            style={[
              styles.typeBadge,
              stop.type === "DELIVERY" && styles.typeBadgeDelivery,
            ]}
          >
            <ThemedText style={styles.typeText}>{stop.type}</ThemedText>
          </View>
          <ThemedText style={[styles.companyName, completed && styles.textCompleted]} numberOfLines={expanded ? undefined : 1}>
            {stop.companyName}
          </ThemedText>
        </View>

        {/* Полный адрес если пришёл с сервера, иначе city, state; свёрнуто — максимум 2 строки */}
        <ThemedText
          style={[styles.location, completed && styles.textCompleted]}
          numberOfLines={expanded ? undefined : 2}
        >
          {primaryAddress}
        </ThemedText>

        {/* Дополнительная строка с address — только развёрнуто и если отличается */}
        {expanded && stop.address && stop.address !== stop.fullAddress ? (
          <ThemedText style={[styles.address, completed && styles.textCompleted]}>
            {stop.address}
          </ThemedText>
        ) : null}

        <View style={styles.timeRow}>
          <Feather
            name="clock"
            size={12}
            color={completed ? PingPointColors.textMuted : "#FFFFFF"}
          />
          <ThemedText style={[styles.time, completed && styles.textCompleted]}>
            {formatDateTime(stop.scheduledTime)}
          </ThemedText>
        </View>

        {completed && stop.arrivedAt && (
          <ThemedText style={styles.completedTimeText}>
            Arrived {formatTimeShort(stop.arrivedAt)}
            {stop.departedAt ? ` · Departed ${formatTimeShort(stop.departedAt)}` : ""}
          </ThemedText>
        )}
      </Pressable>

      {actionLabel && !completed && (
        <View style={styles.actionSection}>
          <Pressable
            onPress={handleAction}
            disabled={isLoading}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: isArcade ? PingPointColors.yellow : "#ffffff",
                borderRadius: colors.borderRadius,
              },
              pressed && styles.actionButtonPressed,
              isArcade && Shadows.arcade.yellow,
            ]}
          >
            <ThemedText style={styles.actionButtonText}>{actionLabel}</ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// Re-renders only when its own props change — keeps telemetry/status
// updates elsewhere on the Dashboard from re-rendering every stop row.
export default React.memo(StopCard);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: PingPointColors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: PingPointColors.border,
  },
  containerCompleted: {
    opacity: 0.6,
    backgroundColor: PingPointColors.surfaceLight,
  },
  slimRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    opacity: 0.7,
  },
  slimBadge: {
    width: 20,
    height: 20,
    borderRadius: BorderRadius.full,
    backgroundColor: PingPointColors.cyan,
    alignItems: "center",
    justifyContent: "center",
  },
  slimText: {
    ...Typography.small,
    fontWeight: "600",
    color: PingPointColors.textMuted,
    flex: 1,
  },
  slimTime: {
    ...Typography.caption,
    color: PingPointColors.textMuted,
  },
  leftSection: {
    marginRight: Spacing.md,
  },
  sequenceBadge: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: PingPointColors.surfaceLight,
    borderWidth: 1,
    borderColor: PingPointColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  sequenceBadgeCompleted: {
    backgroundColor: PingPointColors.cyan,
    borderColor: PingPointColors.cyan,
  },
  sequenceBadgeCurrent: {
    backgroundColor: PingPointColors.cyan,
    borderColor: PingPointColors.cyan,
  },
  sequenceText: {
    ...Typography.small,
    fontWeight: "700",
    color: PingPointColors.textPrimary,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  typeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: "rgba(0, 217, 255, 0.2)",
  },
  typeBadgeDelivery: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
  },
  typeText: {
    ...Typography.badge,
    color: PingPointColors.textPrimary,
  },
  companyName: {
    ...Typography.small,
    fontWeight: "600",
    color: PingPointColors.textSecondary,
    flexShrink: 1,
  },
  location: {
    ...Typography.small,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  address: {
    ...Typography.caption,
    fontSize: 18,
    fontWeight: "500",
    color: "#FFFFFF",
    marginBottom: Spacing.xs,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  time: {
    ...Typography.caption,
    fontSize: 16,
    fontWeight: "500",
    color: "#FFFFFF",
  },
  textCompleted: {
    color: PingPointColors.textMuted,
  },
  completedTimeText: {
    ...Typography.caption,
    color: PingPointColors.textMuted,
    marginTop: Spacing.xs,
  },
  actionSection: {
    marginLeft: Spacing.md,
    justifyContent: "center",
  },
  // Primary in-cab tap target — 56px minimum stays even in the compact pass.
  actionButton: {
    minHeight: 56,
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PingPointColors.yellow,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  actionButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.95 }],
  },
  actionButtonText: {
    ...Typography.button,
    color: PingPointColors.background,
  },
});
