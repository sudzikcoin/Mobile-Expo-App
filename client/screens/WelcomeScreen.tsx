import React, { useState, useEffect } from "react";
import { View, StyleSheet, ActivityIndicator, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing, BorderRadius, Typography, Shadows } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";

interface WelcomeScreenProps {
  isLoading: boolean;
  onManualToken?: (token: string) => void;
}

export default function WelcomeScreen({ isLoading }: WelcomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { appTheme } = useAppTheme();
  const isArcade = appTheme === "arcade";

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
