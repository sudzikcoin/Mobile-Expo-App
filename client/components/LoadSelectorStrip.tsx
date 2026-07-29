import React from "react";
import { ScrollView, Pressable, StyleSheet, Platform, View } from "react-native";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";
import { useDriver } from "@/lib/driver-context";

// Narrow strip listing the active load numbers, shown ONLY when two or more
// loads are active at once (partials/LTL). Tapping a chip switches the main
// screen to that load. With a single active load this renders nothing and
// the Dashboard is exactly the single-load experience.
export default function LoadSelectorStrip() {
  const { activeLoads, load, selectLoad } = useDriver();
  const { colors, isArcade } = useAppTheme();

  if (activeLoads.length < 2) return null;

  const handleSelect = (loadId: string) => {
    if (loadId === load?.id) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    void selectLoad(loadId);
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {activeLoads.map((l) => {
          const active = l.id === load?.id;
          const accent = isArcade ? PingPointColors.cyan : "#ffffff";
          return (
            <Pressable
              key={l.id}
              onPress={() => handleSelect(l.id)}
              style={({ pressed }) => [
                styles.chip,
                {
                  borderColor: active ? accent : colors.border,
                  backgroundColor: active
                    ? isArcade
                      ? "rgba(0, 217, 255, 0.18)"
                      : "rgba(255, 255, 255, 0.12)"
                    : colors.surface,
                  borderRadius: colors.borderRadius,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <ThemedText
                style={[
                  styles.chipText,
                  { color: active ? accent : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                #{l.loadNumber}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: Spacing.xs,
  },
  row: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  // In-cab standard: ≥56px targets even for the strip chips.
  chip: {
    minHeight: 56,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 1,
  },
});
