import React from "react";
import { View, StyleSheet, ActivityIndicator, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing, BorderRadius, Typography, Shadows } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";
import { useDriver } from "@/lib/driver-context";

interface WelcomeScreenProps {
  isLoading: boolean;
}

export default function WelcomeScreen({ isLoading }: WelcomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { appTheme } = useAppTheme();
  const { setToken } = useDriver();
  const isArcade = appTheme === "arcade";

  const handleDemoLogin = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await setToken("demo");
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + Spacing["2xl"], paddingBottom: insets.bottom + Spacing["2xl"] },
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.iconContainer, isArcade && styles.iconContainerArcade]}>
          <Feather name="link" size={48} color={PingPointColors.cyan} />
        </View>

        <ThemedText style={styles.title}>PINGPOINT</ThemedText>
        <ThemedText style={styles.subtitle}>DRIVER</ThemedText>

        <View style={styles.messageContainer}>
          {isLoading ? (
            <>
              <ActivityIndicator size="large" color={PingPointColors.cyan} />
              <ThemedText style={styles.message}>Loading your assignment...</ThemedText>
            </>
          ) : (
            <>
              <Feather name="smartphone" size={32} color={PingPointColors.textSecondary} />
              <ThemedText style={styles.message}>Waiting for invite link...</ThemedText>
              <ThemedText style={styles.hint}>
                Open the driver link sent by your dispatcher to get started.
              </ThemedText>

              <Pressable
                onPress={handleDemoLogin}
                style={({ pressed }) => [
                  styles.demoButton,
                  isArcade && styles.demoButtonArcade,
                  pressed && styles.demoButtonPressed,
                ]}
              >
                <Feather name="play" size={18} color={PingPointColors.background} />
                <ThemedText style={styles.demoButtonText}>Try Demo</ThemedText>
              </Pressable>
            </>
          )}
        </View>
      </View>

      <View style={styles.footer}>
        <ThemedText style={styles.footerText}>
          Contact your dispatcher if you haven't received a link.
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PingPointColors.background,
    justifyContent: "space-between",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(0, 217, 255, 0.1)",
    borderWidth: 2,
    borderColor: PingPointColors.cyan,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing["2xl"],
  },
  iconContainerArcade: {
    ...Shadows.arcade.cyan,
  },
  title: {
    fontSize: 36,
    fontWeight: "700",
    color: PingPointColors.cyan,
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "600",
    color: PingPointColors.textSecondary,
    letterSpacing: 6,
    marginBottom: Spacing["4xl"],
  },
  messageContainer: {
    alignItems: "center",
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  message: {
    ...Typography.h4,
    color: PingPointColors.textSecondary,
    textAlign: "center",
  },
  hint: {
    ...Typography.body,
    color: PingPointColors.textMuted,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  demoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: PingPointColors.cyan,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing["2xl"],
    borderRadius: BorderRadius.md,
    marginTop: Spacing["2xl"],
  },
  demoButtonArcade: {
    ...Shadows.arcade.cyan,
  },
  demoButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  demoButtonText: {
    ...Typography.button,
    color: PingPointColors.background,
    textTransform: "uppercase",
  },
  footer: {
    alignItems: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  footerText: {
    ...Typography.caption,
    color: PingPointColors.textMuted,
    textAlign: "center",
  },
});
