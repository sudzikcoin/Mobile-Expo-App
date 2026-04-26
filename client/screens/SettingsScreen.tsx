import React from "react";
import { View, StyleSheet, Pressable, Platform, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import ScreenHeader from "@/components/ScreenHeader";
import { PingPointColors, Spacing, BorderRadius, Typography, Shadows } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";
import { useNavigation } from "@react-navigation/native";
import { useState, useEffect, useCallback } from "react";
import { getTruckNumber, getDriverName, getCompanyName, clearTruckSession } from "@/lib/storage";
import { Alert } from "react-native";

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
  const { appTheme, setAppTheme, colors, isArcade } = useAppTheme();
  const navigation = useNavigation<any>();
  const [truckNumber, setTruckNumberState] = useState<string | null>(null);
  const [driverName, setDriverNameState] = useState<string | null>(null);
  const [companyName, setCompanyNameState] = useState<string | null>(null);

  const loadTruckInfo = useCallback(async () => {
    const t = await getTruckNumber();
    const d = await getDriverName();
    const c = await getCompanyName();
    setTruckNumberState(t);
    setDriverNameState(d);
    setCompanyNameState(c);
  }, []);

  useEffect(() => {
    loadTruckInfo();
    const unsubscribe = navigation.addListener("focus", loadTruckInfo);
    return unsubscribe;
  }, [navigation, loadTruckInfo]);

  const handleChangeTruck = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    Alert.alert(
      "Switch Truck?",
      "This will sign out of the current truck and return you to the picker. Your tracking data on the server is not affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          style: "destructive",
          onPress: async () => {
            await clearTruckSession();
            navigation.reset({
              index: 0,
              routes: [{ name: "TruckSetup" }],
            });
          },
        },
      ],
    );
  };


  const handleThemeChange = (theme: "arcade" | "premium") => {
    console.log("[Settings] Changing theme to:", theme);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setAppTheme(theme);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Settings" />

      <View style={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: colors.textMuted }]}>APPEARANCE</ThemedText>

          <View style={styles.themeSelector}>
            <Pressable
              onPress={() => handleThemeChange("arcade")}
              style={({ pressed }) => [
                styles.themeOption,
                { 
                  backgroundColor: colors.surface,
                  borderColor: isArcade ? PingPointColors.cyan : colors.border,
                  borderRadius: colors.borderRadius,
                },
                isArcade && styles.themeOptionActiveArcade,
                isArcade && Shadows.arcade.cyan,
                pressed && styles.themeOptionPressed,
              ]}
            >
              <Feather
                name="zap"
                size={24}
                color={isArcade ? PingPointColors.cyan : colors.textMuted}
              />
              <ThemedText
                style={[
                  styles.themeOptionLabel,
                  { color: isArcade ? PingPointColors.cyan : colors.textSecondary },
                ]}
              >
                ARCADE 90s
              </ThemedText>
              <ThemedText style={[styles.themeOptionDesc, { color: colors.textMuted }]}>
                Neon glows & cyberpunk vibes
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => handleThemeChange("premium")}
              style={({ pressed }) => [
                styles.themeOption,
                { 
                  backgroundColor: colors.surface,
                  borderColor: !isArcade ? "#ffffff" : colors.border,
                  borderRadius: colors.borderRadius,
                },
                !isArcade && styles.themeOptionActivePremium,
                pressed && styles.themeOptionPressed,
              ]}
            >
              <Feather
                name="moon"
                size={24}
                color={!isArcade ? "#ffffff" : colors.textMuted}
              />
              <ThemedText
                style={[
                  styles.themeOptionLabel,
                  { color: !isArcade ? "#ffffff" : colors.textSecondary },
                ]}
              >
                PREMIUM
              </ThemedText>
              <ThemedText style={[styles.themeOptionDesc, { color: colors.textMuted }]}>
                Clean & refined dark mode
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>TRUCK & DRIVER</ThemedText>
          <SettingRow icon="briefcase" label="Current Company" value={companyName || "Not set"} />
          <SettingRow icon="truck" label="Current Truck" value={truckNumber ? `#${truckNumber}` : "Not set"} />
          <SettingRow icon="user" label="Current Driver" value={driverName || "Not set"} />
          <SettingRow icon="refresh-cw" label="Switch Truck" onPress={handleChangeTruck} />
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>APP INFO</ThemedText>
          <SettingRow icon="info" label="Version" value="1.1.0" />
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
    padding: Spacing.lg,
    borderWidth: 2,
    alignItems: "center",
    gap: Spacing.sm,
  },
  themeOptionActiveArcade: {
    backgroundColor: "rgba(0, 217, 255, 0.1)",
  },
  themeOptionActivePremium: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  themeOptionPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  themeOptionLabel: {
    ...Typography.button,
  },
  themeOptionDesc: {
    ...Typography.caption,
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
