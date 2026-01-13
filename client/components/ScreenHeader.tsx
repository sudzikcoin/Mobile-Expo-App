import React from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";

interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
}

export default function ScreenHeader({ title, showBack = true }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { colors, isArcade } = useAppTheme();

  const handleBack = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.sm, backgroundColor: colors.background }]}>
      {showBack ? (
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          hitSlop={8}
        >
          <Feather name="arrow-left" size={24} color={colors.textPrimary} />
        </Pressable>
      ) : (
        <View style={styles.placeholder} />
      )}
      <ThemedText style={[styles.title, { color: colors.textPrimary }]}>{title}</ThemedText>
      <View style={styles.placeholder} />
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
  },
  backButton: {
    padding: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  backButtonPressed: {
    opacity: 0.7,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  title: {
    ...Typography.h3,
    color: PingPointColors.textPrimary,
    letterSpacing: 1,
  },
  placeholder: {
    width: 32,
  },
});
