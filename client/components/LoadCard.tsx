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
  isLocationDenied: boolean;
  onToggleLocation: () => void;
  onOpenSettings: () => void;
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
  isLocationDenied,
  onToggleLocation,
  onOpenSettings,
}: LoadCardProps) {
  const { colors, isArcade } = useAppTheme();

  const handleToggleLocation = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onToggleLocation();
  };

  const handleOpenSettings = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onOpenSettings();
  };

  return (
    <View style={[
      styles.container, 
      { 
        backgroundColor: colors.surface,
        borderColor: isArcade ? "rgba(0, 217, 255, 0.3)" : colors.border,
        borderRadius: colors.borderRadius,
      },
      isArcade && Shadows.arcade.cyan,
    ]}>
      <View style={styles.header}>
        <ThemedText style={[styles.loadNumber, { color: isArcade ? PingPointColors.yellow : "#ffffff" }]}>LOAD #{load.loadNumber}</ThemedText>
        <View style={[
          styles.statusBadge,
          { 
            borderColor: isArcade ? PingPointColors.cyan : colors.border,
            backgroundColor: isArcade ? "rgba(0, 217, 255, 0.1)" : "rgba(255, 255, 255, 0.1)",
          }
        ]}>
          <ThemedText style={[styles.statusText, { color: isArcade ? PingPointColors.cyan : "#ffffff" }]}>{getStatusLabel(load.status)}</ThemedText>
        </View>
      </View>

      {(() => {
        // originCity/destinationCity могут отсутствовать в ответе сервера — берём из первого PICKUP и последнего DELIVERY
        const pickup = load.stops?.find((s) => s.type === "PICKUP");
        const deliveries = load.stops?.filter((s) => s.type === "DELIVERY") || [];
        const lastDelivery = deliveries[deliveries.length - 1];
        const originCity = (load.originCity || pickup?.city || "—").toUpperCase();
        const destCity = (load.destinationCity || lastDelivery?.city || "—").toUpperCase();
        return (
          <View style={styles.routeContainer}>
            <View style={styles.routePoint}>
              <Feather name="circle" size={10} color={isArcade ? PingPointColors.cyan : "#ffffff"} />
              <ThemedText style={[styles.routeCity, { color: colors.textPrimary }]}>
                {originCity}
              </ThemedText>
            </View>
            <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
            <View style={styles.routePoint}>
              <Feather name="map-pin" size={12} color={isArcade ? PingPointColors.yellow : "#ffffff"} />
              <ThemedText style={[styles.routeCity, { color: colors.textPrimary }]}>
                {destCity}
              </ThemedText>
            </View>
          </View>
        );
      })()}

      {isLocationDenied && Platform.OS !== "web" ? (
        <View style={styles.deniedContainer}>
          <Pressable
            onPress={handleOpenSettings}
            style={({ pressed }) => [
              styles.locationButton,
              styles.settingsButton,
              pressed && styles.locationButtonPressed,
            ]}
          >
            <Feather name="settings" size={18} color={PingPointColors.background} />
            <ThemedText style={styles.locationButtonText}>Open Settings</ThemedText>
          </Pressable>
          <ThemedText style={styles.deniedText}>
            Location permission was denied. Enable it in Settings to share your location.
          </ThemedText>
        </View>
      ) : (
        <Pressable
          onPress={handleToggleLocation}
          disabled={isLocationLoading}
          style={({ pressed }) => [
            styles.locationButton,
            { 
              backgroundColor: isLocationEnabled 
                ? (isArcade ? PingPointColors.cyan : "#ffffff") 
                : (isArcade ? PingPointColors.yellow : "#555555"),
              borderRadius: colors.borderRadius,
            },
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
      )}
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
  deniedContainer: {
    gap: Spacing.sm,
  },
  settingsButton: {
    backgroundColor: PingPointColors.textMuted,
  },
  deniedText: {
    ...Typography.caption,
    color: PingPointColors.textMuted,
    textAlign: "center",
  },
});
