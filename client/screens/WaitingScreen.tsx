import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing } from "@/constants/theme";
import { useDriver } from "@/lib/driver-context";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Waiting">;

// Default first-run screen. No company/truck pickers — the device binds
// itself when the driver taps the universal link from the SMS/telegram
// invite (or silently via the deferred deep link on first launch).
//
// Hidden service entrance: 5 consecutive taps on the logo opens the legacy
// Select Company → Select Truck flow (internal/debug only).
const SERVICE_TAP_COUNT = 5;
const SERVICE_TAP_WINDOW_MS = 3000;

export default function WaitingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { isBound, error } = useDriver();

  const tapCountRef = useRef(0);
  const firstTapAtRef = useRef(0);
  const [tapsLeft, setTapsLeft] = useState<number | null>(null);

  // The deferred-deep-link probe or a warm-start link tap can bind the
  // device while this screen is up — move to Main as soon as that happens.
  useEffect(() => {
    if (isBound) {
      navigation.replace("Main", { screen: "Dashboard" } as never);
    }
  }, [isBound, navigation]);

  const onLogoTap = () => {
    const now = Date.now();
    if (now - firstTapAtRef.current > SERVICE_TAP_WINDOW_MS) {
      tapCountRef.current = 0;
      firstTapAtRef.current = now;
    }
    tapCountRef.current += 1;
    // Give a subtle countdown hint only after the third tap so the entrance
    // stays invisible to drivers tapping around casually.
    if (tapCountRef.current >= 3) {
      setTapsLeft(SERVICE_TAP_COUNT - tapCountRef.current);
    }
    if (tapCountRef.current >= SERVICE_TAP_COUNT) {
      tapCountRef.current = 0;
      setTapsLeft(null);
      navigation.navigate("TruckSetup");
    }
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
      ]}
    >
      <Pressable onPress={onLogoTap} style={styles.header} testID="waiting-logo">
        <ThemedText style={styles.logo}>PINGPOINT</ThemedText>
        <ThemedText style={styles.logoSub}>DRIVER</ThemedText>
      </Pressable>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Feather name="link" size={44} color={PingPointColors.cyan} />
        </View>
        <ThemedText style={styles.title}>Waiting for your load</ThemedText>
        <ThemedText style={styles.hint}>
          Tap the link from your dispatcher or broker to start.
        </ThemedText>
        <ActivityIndicator
          size="small"
          color={PingPointColors.textMuted}
          style={styles.spinner}
        />
        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
        {tapsLeft !== null && tapsLeft > 0 ? (
          <ThemedText style={styles.serviceHint}>{tapsLeft}</ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PingPointColors.background,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  logo: {
    fontSize: 32,
    fontWeight: "700",
    color: PingPointColors.cyan,
    letterSpacing: 4,
  },
  logoSub: {
    fontSize: 14,
    fontWeight: "600",
    color: PingPointColors.textSecondary,
    letterSpacing: 6,
    marginTop: -4,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: PingPointColors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: PingPointColors.textPrimary,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  hint: {
    fontSize: 15,
    color: PingPointColors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  spinner: {
    marginTop: Spacing.xl,
  },
  error: {
    marginTop: Spacing.lg,
    fontSize: 13,
    color: "#e74c3c",
    textAlign: "center",
  },
  serviceHint: {
    position: "absolute",
    bottom: Spacing.lg,
    fontSize: 12,
    color: PingPointColors.textMuted,
  },
});
