import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Platform } from "react-native";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing, BorderRadius, Typography, Shadows } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";

interface RewardAnimationProps {
  points: number;
  visible: boolean;
  onComplete: () => void;
}

export default function RewardAnimation({ points, visible, onComplete }: RewardAnimationProps) {
  const { appTheme } = useAppTheme();
  const isArcade = appTheme === "arcade";

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (visible) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
      translateYAnim.setValue(50);

      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 5,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(translateYAnim, {
          toValue: 0,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();

      const timeout = setTimeout(() => {
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 0.8,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(translateYAnim, {
            toValue: -30,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          onComplete();
        });
      }, 1500);

      return () => clearTimeout(timeout);
    }
  }, [visible, scaleAnim, opacityAnim, translateYAnim, onComplete]);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Animated.View
        style={[
          styles.container,
          isArcade && styles.containerArcade,
          {
            opacity: opacityAnim,
            transform: [{ scale: scaleAnim }, { translateY: translateYAnim }],
          },
        ]}
      >
        <ThemedText style={styles.points}>+{points}</ThemedText>
        <ThemedText style={styles.label}>PINGPOINTS</ThemedText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 1000,
  },
  container: {
    backgroundColor: PingPointColors.cyan,
    paddingHorizontal: Spacing["3xl"],
    paddingVertical: Spacing["2xl"],
    borderRadius: BorderRadius.xl,
    alignItems: "center",
  },
  containerArcade: {
    ...Shadows.arcade.cyan,
  },
  points: {
    fontSize: 48,
    fontWeight: "700",
    color: PingPointColors.background,
    letterSpacing: 2,
  },
  label: {
    ...Typography.button,
    color: PingPointColors.background,
    marginTop: Spacing.xs,
  },
});
