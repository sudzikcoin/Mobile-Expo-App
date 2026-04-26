import React from "react";
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

export default function StopCard({ stop, isCurrent, onAction, isLoading }: StopCardProps) {
  const { colors, isArcade } = useAppTheme();
  const completed = isStopCompleted(stop);
  const actionLabel = getStopActionLabel(stop);

  const handleAction = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const action = stop.status === "PENDING" ? "arrive" : "depart";
    onAction(stop.id, action);
  };

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

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View
            style={[
              styles.typeBadge,
              stop.type === "DELIVERY" && styles.typeBadgeDelivery,
            ]}
          >
            <ThemedText style={styles.typeText}>{stop.type}</ThemedText>
          </View>
        </View>

        <ThemedText
          style={[styles.companyName, completed && styles.textCompleted]}
        >
          {stop.companyName}
        </ThemedText>

        {/* Отображаем полный адрес если он пришёл с сервера, иначе city, state */}
        <ThemedText style={[styles.location, completed && styles.textCompleted]}>
          {stop.fullAddress || `${stop.city}${stop.state ? ", " + stop.state : ""}`}
        </ThemedText>

        {/* Дополнительная строка с address — только если fullAddress не используется или отличается */}
        {stop.address && stop.address !== stop.fullAddress ? (
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
          <View style={styles.completedTimes}>
            <ThemedText style={styles.completedTimeText}>
              Arrived: {formatDateTime(stop.arrivedAt)}
            </ThemedText>
            {stop.departedAt && (
              <ThemedText style={styles.completedTimeText}>
                Departed: {formatDateTime(stop.departedAt)}
              </ThemedText>
            )}
          </View>
        )}
      </View>

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

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: PingPointColors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: PingPointColors.border,
  },
  containerCompleted: {
    opacity: 0.6,
    backgroundColor: PingPointColors.surfaceLight,
  },
  containerCurrent: {
    borderColor: PingPointColors.cyan,
    borderWidth: 2,
  },
  containerCurrentArcade: {
    ...Shadows.arcade.cyan,
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
    marginBottom: Spacing.sm,
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
    ...Typography.body,
    fontWeight: "600",
    color: PingPointColors.textPrimary,
    marginBottom: Spacing.xs,
  },
  location: {
    ...Typography.small,
    fontSize: 22,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  address: {
    ...Typography.caption,
    fontSize: 18,
    fontWeight: "500",
    color: "#FFFFFF",
    marginBottom: Spacing.sm,
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
  completedTimes: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: PingPointColors.border,
  },
  completedTimeText: {
    ...Typography.caption,
    color: PingPointColors.textMuted,
  },
  actionSection: {
    marginLeft: Spacing.md,
    justifyContent: "center",
  },
  actionButton: {
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
