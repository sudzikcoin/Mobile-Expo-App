import React from "react";
import { View, StyleSheet } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useIOSiXTelemetry } from "@/lib/iosix/hook";
import { useAppTheme } from "@/lib/theme-context";
import { kphToMph } from "@/lib/units";

// Owns the telemetry subscription so BLE ticks (~1s with the ELD streaming)
// re-render only this pill, not the whole Dashboard tree. Moving the hook
// out of DashboardScreen is what stops the screen-wide re-render storm —
// keep it here.
export default function EldStatusPill() {
  const { colors, isArcade } = useAppTheme();
  const iosix = useIOSiXTelemetry(true);

  // Pill speed: ECU road speed (f3) when present and sane, else GPS ground
  // speed (f13). Integer mph; null hides the segment entirely.
  const pillSpeedKph =
    iosix.telemetry.ecuSpeedKph !== null &&
    iosix.telemetry.ecuSpeedKph >= 0 &&
    iosix.telemetry.ecuSpeedKph <= 200
      ? iosix.telemetry.ecuSpeedKph
      : iosix.telemetry.gpsSpeedKph;
  const pillSpeedMph =
    pillSpeedKph !== null ? Math.round(kphToMph(pillSpeedKph)) : null;

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: isArcade ? "rgba(0, 217, 255, 0.1)" : "rgba(255, 255, 255, 0.05)",
          borderColor: isArcade ? PingPointColors.cyan : colors.border,
          borderRadius: colors.borderRadius,
        },
      ]}
    >
      <View style={styles.row}>
        <View
          style={[
            styles.dot,
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
            styles.text,
            { color: isArcade ? PingPointColors.cyan : "#ffffff" },
          ]}
          numberOfLines={1}
        >
          {iosix.connected
            // Driver-facing telemetry: RPM (f2), battery voltage (f8)
            // and road speed. Speed prefers the ECU value (f3) when
            // present and sane — it is hard 0 with the engine off and
            // governed at 120 km/h — falling back to GPS ground speed
            // (f13, drifts a few km/h parked but works without ECU
            // data). With the engine off (f0=0) RPM would be a
            // stale/zero reading — show ENGINE OFF instead; voltage
            // stays live on battery power.
            ? iosix.telemetry.ignition === false
              ? `ELD · ENGINE OFF${iosix.telemetry.batteryVoltage !== null ? ` · ${iosix.telemetry.batteryVoltage.toFixed(1)}V` : ""}`
              : `ELD${iosix.telemetry.rpm !== null ? ` · ${Math.round(iosix.telemetry.rpm)} RPM` : ""}${iosix.telemetry.batteryVoltage !== null ? ` · ${iosix.telemetry.batteryVoltage.toFixed(1)}V` : ""}${pillSpeedMph !== null ? ` · ${pillSpeedMph} mph` : ""}`
            : iosix.scanning
            ? "Scanning for ELD..."
            : iosix.error === "ble_permission_denied"
            ? "ELD: Bluetooth permission denied"
            : "ELD Not Connected"}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Status pill, not a tap target: 48px keeps it readable at arm's length
  // while giving the fold back some room.
  pill: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    ...Typography.small,
    fontWeight: "600",
    flexShrink: 1,
  },
});
