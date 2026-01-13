import React from "react";
import { View, StyleSheet, Pressable, Platform, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import ScreenHeader from "@/components/ScreenHeader";
import { PingPointColors, Spacing, BorderRadius, Typography, Shadows } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";

interface SettingRowProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  isToggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (value: boolean) => void;
}

function SettingRow({
  icon,
  label,
  value,
  onPress,
  isToggle,
  toggleValue,
  onToggle,
}: SettingRowProps) {
  const { appTheme } = useAppTheme();
  const isArcade = appTheme === "arcade";

  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  };

  const handleToggle = (val: boolean) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onToggle?.(val);
  };

  const content = (
    <View style={[styles.settingRow, isArcade && styles.settingRowArcade]}>
      <View style={styles.settingIconContainer}>
        <Feather name={icon} size={20} color={PingPointColors.cyan} />
      </View>
      <View style={styles.settingContent}>
        <ThemedText style={styles.settingLabel}>{label}</ThemedText>
        {value ? <ThemedText style={styles.settingValue}>{value}</ThemedText> : null}
      </View>
      {isToggle ? (
        <Switch
          value={toggleValue}
          onValueChange={handleToggle}
          trackColor={{
            false: PingPointColors.border,
            true: PingPointColors.cyan,
          }}
          thumbColor={PingPointColors.textPrimary}
          ios_backgroundColor={PingPointColors.border}
        />
      ) : onPress ? (
        <Feather name="chevron-right" size={20} color={PingPointColors.textMuted} />
      ) : null}
    </View>
  );

  if (onPress && !isToggle) {
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [pressed && styles.settingPressed]}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { appTheme, toggleTheme } = useAppTheme();
  const isArcade = appTheme === "arcade";

  return (
    <View style={styles.container}>
      <ScreenHeader title="Settings" />

      <View style={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>APPEARANCE</ThemedText>

          <View style={styles.themeSelector}>
            <Pressable
              onPress={() => {
                if (appTheme !== "arcade") {
                  if (Platform.OS !== "web") {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }
                  toggleTheme();
                }
              }}
              style={({ pressed }) => [
                styles.themeOption,
                isArcade && styles.themeOptionActive,
                isArcade && Shadows.arcade.cyan,
                pressed && styles.themeOptionPressed,
              ]}
            >
              <Feather
                name="zap"
                size={24}
                color={isArcade ? PingPointColors.cyan : PingPointColors.textMuted}
              />
              <ThemedText
                style={[
                  styles.themeOptionLabel,
                  isArcade && styles.themeOptionLabelActive,
                ]}
              >
                ARCADE 90s
              </ThemedText>
              <ThemedText style={styles.themeOptionDesc}>
                Neon glows & cyberpunk vibes
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => {
                if (appTheme !== "premium") {
                  if (Platform.OS !== "web") {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }
                  toggleTheme();
                }
              }}
              style={({ pressed }) => [
                styles.themeOption,
                !isArcade && styles.themeOptionActive,
                pressed && styles.themeOptionPressed,
              ]}
            >
              <Feather
                name="moon"
                size={24}
                color={!isArcade ? PingPointColors.cyan : PingPointColors.textMuted}
              />
              <ThemedText
                style={[
                  styles.themeOptionLabel,
                  !isArcade && styles.themeOptionLabelActive,
                ]}
              >
                PREMIUM
              </ThemedText>
              <ThemedText style={styles.themeOptionDesc}>
                Clean & refined dark mode
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>APP INFO</ThemedText>
          <SettingRow icon="info" label="Version" value="1.0.0" />
          <SettingRow icon="shield" label="Privacy Policy" onPress={() => {}} />
          <SettingRow icon="file-text" label="Terms of Service" onPress={() => {}} />
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>SUPPORT</ThemedText>
          <SettingRow icon="help-circle" label="Help Center" onPress={() => {}} />
          <SettingRow icon="mail" label="Contact Support" onPress={() => {}} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PingPointColors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  section: {
    marginBottom: Spacing["2xl"],
  },
  sectionTitle: {
    ...Typography.caption,
    fontWeight: "600",
    color: PingPointColors.textMuted,
    letterSpacing: 2,
    marginBottom: Spacing.md,
    marginLeft: Spacing.xs,
  },
  themeSelector: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  themeOption: {
    flex: 1,
    backgroundColor: PingPointColors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 2,
    borderColor: PingPointColors.border,
    alignItems: "center",
    gap: Spacing.sm,
  },
  themeOptionActive: {
    borderColor: PingPointColors.cyan,
    backgroundColor: "rgba(0, 217, 255, 0.1)",
  },
  themeOptionPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  themeOptionLabel: {
    ...Typography.button,
    color: PingPointColors.textSecondary,
  },
  themeOptionLabelActive: {
    color: PingPointColors.cyan,
  },
  themeOptionDesc: {
    ...Typography.caption,
    color: PingPointColors.textMuted,
    textAlign: "center",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PingPointColors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: PingPointColors.border,
  },
  settingRowArcade: {
    borderColor: "rgba(0, 217, 255, 0.15)",
  },
  settingPressed: {
    opacity: 0.8,
  },
  settingIconContainer: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(0, 217, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  settingContent: {
    flex: 1,
  },
  settingLabel: {
    ...Typography.body,
    color: PingPointColors.textPrimary,
  },
  settingValue: {
    ...Typography.small,
    color: PingPointColors.textSecondary,
    marginTop: 2,
  },
});
