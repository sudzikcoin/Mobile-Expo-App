import React from "react";
import { View, StyleSheet, Pressable, Platform, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing, BorderRadius, Typography, Shadows } from "@/constants/theme";
import { Load, LoadStatus } from "@/lib/types";
import { useAppTheme } from "@/lib/theme-context";

interface LoadCardProps {
  load: Load;
  isLocationEnabled: boolean;
  isLocationLoading: boolean;
  onToggleLocation: () => void;
}

function getStatusLabel(status: LoadStatus): string {
  switch (status) {
    case "PLANNED":
      return "PLANNED";
    case "IN_TRANSIT":
      return "IN TRANSIT";
    case "DELIVERED":
      return "DELIVERED";
    default:
      return status;
  }
}

export default function LoadCard({
  load,
  isLocationEnabled,
  isLocationLoading,
  onToggleLocation,
}: LoadCardProps) {
  const { appTheme } = useAppTheme();
  const isArcade = appTheme === "arcade";

  const handleToggleLocation = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onToggleLocation();
  };

  return (
    <View style={[styles.container, isArcade && styles.containerArcade]}>
      <View style={styles.header}>
        <ThemedText style={styles.loadNumber}>LOAD #{load.loadNumber}</ThemedText>
        <View style={styles.statusBadge}>
          <ThemedText style={styles.statusText}>{getStatusLabel(load.status)}</ThemedText>
        </View>
      </View>

      <View style={styles.routeContainer}>
        <View style={styles.routePoint}>
          <Feather name="circle" size={10} color={PingPointColors.cyan} />
          <ThemedText style={styles.routeCity}>
            {load.originCity.toUpperCase()}
          </ThemedText>
        </View>
        <View style={styles.routeLine} />
        <View style={styles.routePoint}>
          <Feather name="map-pin" size={12} color={PingPointColors.yellow} />
          <ThemedText style={styles.routeCity}>
            {load.destinationCity.toUpperCase()}
          </ThemedText>
        </View>
      </View>

      <Pressable
        onPress={handleToggleLocation}
        disabled={isLocationLoading}
        style={({ pressed }) => [
          styles.locationButton,
          isLocationEnabled && styles.locationButtonEnabled,
          pressed && styles.locationButtonPressed,
          isArcade && (isLocationEnabled ? Shadows.arcade.cyan : Shadows.arcade.yellow),
        ]}
      >
        {isLocationLoading ? (
          <ActivityIndicator size="small" color={PingPointColors.background} />
        ) : (
          <>
            <Feather
              name={isLocationEnabled ? "navigation" : "navigation-2"}
              size={18}
              color={PingPointColors.background}
            />
            <ThemedText style={styles.locationButtonText}>
              {isLocationEnabled ? "Location Sharing Active" : "Enable Location Sharing"}
            </ThemedText>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: PingPointColors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: PingPointColors.border,
  },
  containerArcade: {
    borderColor: "rgba(0, 217, 255, 0.3)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  loadNumber: {
    ...Typography.h3,
    color: PingPointColors.yellow,
    letterSpacing: 1,
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: PingPointColors.cyan,
    backgroundColor: "rgba(0, 217, 255, 0.1)",
  },
  statusText: {
    ...Typography.badge,
    color: PingPointColors.cyan,
  },
  routeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.sm,
  },
  routePoint: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  routeCity: {
    ...Typography.body,
    fontWeight: "600",
    color: PingPointColors.textPrimary,
    letterSpacing: 1,
  },
  routeLine: {
    flex: 1,
    height: 2,
    backgroundColor: PingPointColors.border,
    marginHorizontal: Spacing.md,
  },
  locationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: PingPointColors.yellow,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  locationButtonEnabled: {
    backgroundColor: PingPointColors.cyan,
  },
  locationButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  locationButtonText: {
    ...Typography.button,
    color: PingPointColors.background,
    textTransform: "uppercase",
  },
});
