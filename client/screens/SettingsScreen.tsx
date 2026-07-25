import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, StyleSheet, Pressable, Platform, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { useNavigation } from "@react-navigation/native";

import { ThemedText } from "@/components/ThemedText";
import ScreenHeader from "@/components/ScreenHeader";
import { PingPointColors, Spacing, BorderRadius, Typography, Shadows } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";
import { useDriver } from "@/lib/driver-context";
import { useI18n, AppLanguage } from "@/lib/i18n";
import { useUnits, AppUnits } from "@/lib/units-context";
import { getTruckNumber, getDriverName } from "@/lib/storage";
import { useIOSiXTelemetry } from "@/lib/iosix/hook";
import { shareDiagnostics } from "@/lib/diagnostics";

const LEGAL_PRIVACY_URL = "https://pingpoint.suverse.io/legal/privacy";
const LEGAL_TERMS_URL = "https://pingpoint.suverse.io/legal/terms";

// Service door: 5 taps on the Version row within 3s reveals the ADVANCED
// section (legacy transistorsoft screen, raw logs, manual truck switch).
// Same gesture family as the waiting-screen logo entrance.
const SERVICE_TAP_COUNT = 5;
const SERVICE_TAP_WINDOW_MS = 3000;

interface SettingRowProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  accent?: string;
  rightElement?: React.ReactNode;
}

function SettingRow({ icon, label, value, onPress, accent, rightElement }: SettingRowProps) {
  const { appTheme } = useAppTheme();
  const isArcade = appTheme === "arcade";
  const color = accent ?? PingPointColors.cyan;

  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  };

  const content = (
    <View style={[styles.settingRow, isArcade && styles.settingRowArcade]}>
      <View style={[styles.settingIconContainer, { backgroundColor: `${color}1a` }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <View style={styles.settingContent}>
        <ThemedText style={styles.settingLabel}>{label}</ThemedText>
        {value ? <ThemedText style={styles.settingValue}>{value}</ThemedText> : null}
      </View>
      {rightElement ? (
        rightElement
      ) : onPress ? (
        <Feather name="chevron-right" size={20} color={PingPointColors.textMuted} />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={handlePress} style={({ pressed }) => [pressed && styles.settingPressed]}>
        {content}
      </Pressable>
    );
  }
  return content;
}

// Two-option selector (Units, Language) — same visual family as the theme
// cards but compact rows; ≥56px targets.
function PairSelector<T extends string>({
  options,
  selected,
  onSelect,
  accent,
}: {
  options: Array<{ value: T; label: string }>;
  selected: T;
  onSelect: (v: T) => void;
  accent: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.pairRow}>
      {options.map((opt) => {
        const active = opt.value === selected;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
              onSelect(opt.value);
            }}
            style={({ pressed }) => [
              styles.pairOption,
              {
                backgroundColor: active ? `${accent}1f` : colors.surface,
                borderColor: active ? accent : colors.border,
                borderRadius: colors.borderRadius,
              },
              pressed && { opacity: 0.8 },
            ]}
          >
            <ThemedText
              style={[
                styles.pairOptionLabel,
                { color: active ? accent : colors.textSecondary },
              ]}
            >
              {opt.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { appTheme, setAppTheme, colors, isArcade } = useAppTheme();
  const { clearBinding } = useDriver();
  const { t, lang, setLanguage } = useI18n();
  const { units, setUnits } = useUnits();
  const navigation = useNavigation<any>();
  const [truckNumber, setTruckNumberState] = useState<string | null>(null);
  const [driverName, setDriverNameState] = useState<string | null>(null);
  const [advancedUnlocked, setAdvancedUnlocked] = useState(false);

  // VIN comes from the live ELD stream — telemetry identity, not manual
  // entry. The dot goes green while frames are fresh.
  const iosix = useIOSiXTelemetry(true);
  const vin = iosix.telemetry.vin;
  const vinLive =
    iosix.connected &&
    iosix.telemetry.lastUpdated !== null &&
    Date.now() - iosix.telemetry.lastUpdated < 60_000;

  const loadTruckInfo = useCallback(async () => {
    const tnum = await getTruckNumber();
    const dname = await getDriverName();
    setTruckNumberState(tnum);
    setDriverNameState(dname);
  }, []);

  useEffect(() => {
    loadTruckInfo();
    const unsubscribe = navigation.addListener("focus", loadTruckInfo);
    return unsubscribe;
  }, [navigation, loadTruckInfo]);

  const tapCountRef = useRef(0);
  const firstTapAtRef = useRef(0);
  const onVersionTap = () => {
    const now = Date.now();
    if (now - firstTapAtRef.current > SERVICE_TAP_WINDOW_MS) {
      tapCountRef.current = 0;
      firstTapAtRef.current = now;
    }
    tapCountRef.current += 1;
    if (tapCountRef.current >= SERVICE_TAP_COUNT && !advancedUnlocked) {
      tapCountRef.current = 0;
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setAdvancedUnlocked(true);
    }
  };

  const handleSwitchTruck = () => {
    Alert.alert(t("settings.switchTitle"), t("settings.switchBody"), [
      { text: t("dash.cancel"), style: "cancel" },
      {
        text: t("settings.switchConfirm"),
        style: "destructive",
        onPress: async () => {
          await clearBinding();
          navigation.reset({ index: 0, routes: [{ name: "Waiting" }] });
        },
      },
    ]);
  };

  const handleSendDiagnostics = async () => {
    try {
      await shareDiagnostics(t("settings.diagShareTitle"));
    } catch (e) {
      console.warn("[Settings] Share diagnostics failed:", e);
    }
  };

  const handleThemeChange = (theme: "arcade" | "premium") => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setAppTheme(theme);
  };

  // Real version from the native package — never hardcode. Web (harness)
  // has no native package, so fall back to the config version there.
  const appVersion =
    Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "—";
  const buildNumber = Application.nativeBuildVersion ?? "—";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t("settings.title")} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: colors.textMuted }]}>
            {t("settings.appearance")}
          </ThemedText>

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
              <Feather name="zap" size={24} color={isArcade ? PingPointColors.cyan : colors.textMuted} />
              <ThemedText
                style={[
                  styles.themeOptionLabel,
                  { color: isArcade ? PingPointColors.cyan : colors.textSecondary },
                ]}
              >
                ARCADE 90s
              </ThemedText>
              <ThemedText style={[styles.themeOptionDesc, { color: colors.textMuted }]}>
                {t("settings.arcadeDesc")}
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
              <Feather name="moon" size={24} color={!isArcade ? "#ffffff" : colors.textMuted} />
              <ThemedText
                style={[
                  styles.themeOptionLabel,
                  { color: !isArcade ? "#ffffff" : colors.textSecondary },
                ]}
              >
                PREMIUM
              </ThemedText>
              <ThemedText style={[styles.themeOptionDesc, { color: colors.textMuted }]}>
                {t("settings.premiumDesc")}
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: colors.textMuted }]}>
            {t("settings.truckDriver")}
          </ThemedText>
          <SettingRow
            icon="user"
            label={t("settings.driver")}
            value={driverName || t("settings.notSet")}
          />
          <SettingRow
            icon="cpu"
            label={t("settings.vin")}
            value={vin || t("settings.vinWaiting")}
            accent={vinLive ? "#00ff88" : PingPointColors.cyan}
            rightElement={
              vinLive ? (
                <View style={styles.liveWrap}>
                  <View style={styles.liveDot} />
                  <ThemedText style={styles.liveText}>{t("settings.live")}</ThemedText>
                </View>
              ) : undefined
            }
          />
          {truckNumber ? (
            <SettingRow icon="truck" label={t("settings.truck")} value={`#${truckNumber}`} />
          ) : null}
        </View>

        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: colors.textMuted }]}>
            {t("settings.units")}
          </ThemedText>
          <PairSelector<AppUnits>
            options={[
              { value: "mi", label: t("settings.unitsMiles") },
              { value: "km", label: t("settings.unitsKm") },
            ]}
            selected={units}
            onSelect={(v) => void setUnits(v)}
            accent={PingPointColors.cyan}
          />
        </View>

        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: colors.textMuted }]}>
            {t("settings.language")}
          </ThemedText>
          <PairSelector<AppLanguage>
            options={[
              { value: "en", label: "English" },
              { value: "es", label: "Español" },
            ]}
            selected={lang}
            onSelect={(v) => void setLanguage(v)}
            accent={PingPointColors.magenta}
          />
        </View>

        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: colors.textMuted }]}>
            {t("settings.appInfo")}
          </ThemedText>
          <SettingRow
            icon="info"
            label={t("settings.version")}
            value={`${appVersion} (${buildNumber})`}
            onPress={onVersionTap}
            rightElement={<View />}
          />
          <SettingRow
            icon="shield"
            label={t("legal.privacy")}
            onPress={() =>
              navigation.navigate("Legal", { url: LEGAL_PRIVACY_URL, title: t("legal.privacy") })
            }
          />
          <SettingRow
            icon="file-text"
            label={t("legal.terms")}
            onPress={() =>
              navigation.navigate("Legal", { url: LEGAL_TERMS_URL, title: t("legal.terms") })
            }
          />
        </View>

        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: colors.textMuted }]}>
            {t("settings.support")}
          </ThemedText>
          <SettingRow
            icon="share"
            label={t("settings.sendDiagnostics")}
            value={t("settings.sendDiagnosticsDesc")}
            onPress={handleSendDiagnostics}
          />
        </View>

        {advancedUnlocked ? (
          <View style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: PingPointColors.yellow }]}>
              {t("settings.advanced")}
            </ThemedText>
            <SettingRow
              icon="navigation"
              label={t("settings.trackingLegacy")}
              accent={PingPointColors.yellow}
              onPress={() => navigation.navigate("TrackingStatus")}
            />
            <SettingRow
              icon="file-text"
              label={t("settings.logs")}
              accent={PingPointColors.yellow}
              onPress={() => navigation.navigate("Logs")}
            />
            <SettingRow
              icon="refresh-cw"
              label={t("settings.switchTruck")}
              accent={PingPointColors.yellow}
              onPress={handleSwitchTruck}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
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
  // In-cab standard: rows are ≥56px targets with 17px labels.
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PingPointColors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    minHeight: 60,
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
    width: 40,
    height: 40,
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
    fontSize: 17,
    fontWeight: "500",
    color: PingPointColors.textPrimary,
  },
  settingValue: {
    ...Typography.small,
    color: PingPointColors.textSecondary,
    marginTop: 2,
  },
  liveWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "#00ff88",
    backgroundColor: "rgba(0, 255, 136, 0.08)",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00ff88",
  },
  liveText: {
    ...Typography.badge,
    color: "#00ff88",
  },
  pairRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  pairOption: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
  },
  pairOptionLabel: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
});
