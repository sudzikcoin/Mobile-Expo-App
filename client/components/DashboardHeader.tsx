import React from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useNavigation, DrawerActions } from "@react-navigation/native";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing, BorderRadius, Typography, Shadows } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";

interface DashboardHeaderProps {
  balance: number;
}

export default function DashboardHeader({ balance }: DashboardHeaderProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { appTheme } = useAppTheme();
  const isArcade = appTheme === "arcade";

  const handleMenuPress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    navigation.dispatch(DrawerActions.openDrawer());
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.sm }]}>
      <View style={[styles.balancePill, isArcade && styles.balancePillArcade]}>
        <Feather name="award" size={14} color={PingPointColors.cyan} />
        <ThemedText style={styles.balanceText}>Balance: {balance}</ThemedText>
      </View>

      <View style={styles.titleContainer}>
        <ThemedText style={styles.title}>PINGPOINT</ThemedText>
        <ThemedText style={styles.subtitle}>DRIVER</ThemedText>
      </View>

      <View style={styles.rightSection}>
        <View style={styles.themeBadge}>
          <ThemedText style={styles.themeBadgeText}>
            {isArcade ? "ARCADE" : "PREMIUM"}
          </ThemedText>
        </View>
        <Pressable
          onPress={handleMenuPress}
          style={({ pressed }) => [
            styles.menuButton,
            isArcade && styles.menuButtonArcade,
            pressed && styles.menuButtonPressed,
          ]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          testID="hamburger-menu"
        >
          <Feather name="menu" size={24} color={PingPointColors.cyan} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: PingPointColors.background,
    zIndex: 100,
  },
  balancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(0, 217, 255, 0.15)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: PingPointColors.cyan,
  },
  balancePillArcade: {
    ...Shadows.arcade.cyan,
  },
  balanceText: {
    ...Typography.small,
    fontWeight: "600",
    color: PingPointColors.cyan,
  },
  titleContainer: {
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: PingPointColors.textPrimary,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: PingPointColors.cyan,
    letterSpacing: 4,
    marginTop: -2,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  themeBadge: {
    backgroundColor: "rgba(0, 217, 255, 0.1)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  themeBadgeText: {
    ...Typography.badge,
    color: PingPointColors.textSecondary,
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(0, 217, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(0, 217, 255, 0.3)",
    zIndex: 10,
  },
  menuButtonArcade: {
    ...Shadows.arcade.cyan,
  },
  menuButtonPressed: {
    opacity: 0.8,
    backgroundColor: "rgba(0, 217, 255, 0.25)",
    transform: [{ scale: 0.95 }],
  },
});
