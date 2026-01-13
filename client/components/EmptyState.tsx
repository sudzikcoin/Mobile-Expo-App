import React from "react";
import { View, StyleSheet, Image, ImageSourcePropType } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing, Typography } from "@/constants/theme";

interface EmptyStateProps {
  image: ImageSourcePropType;
  title: string;
  description?: string;
}

export default function EmptyState({ image, title, description }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Image source={image} style={styles.image} resizeMode="contain" />
      <ThemedText style={styles.title}>{title}</ThemedText>
      {description ? (
        <ThemedText style={styles.description}>{description}</ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  image: {
    width: 200,
    height: 200,
    marginBottom: Spacing.xl,
    opacity: 0.8,
  },
  title: {
    ...Typography.h4,
    color: PingPointColors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  description: {
    ...Typography.body,
    color: PingPointColors.textMuted,
    textAlign: "center",
  },
});
