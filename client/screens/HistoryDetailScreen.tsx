import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import ScreenHeader from "@/components/ScreenHeader";
import { PingPointColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n";
import type { DrawerParamList } from "@/navigation/DrawerNavigator";
import type { HistoryLoad } from "@/screens/HistoryScreen";
import type { Stop } from "@/lib/types";

// Detail view for a delivered load, fed from the history payload passed in
// route params — no extra fetch. Shows the full stop list with addresses
// and the geofence Arrived/Departed timestamps.
type HistoryDetailRouteProp = RouteProp<DrawerParamList, "HistoryDetail">;

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StopRow({ stop }: { stop: Stop }) {
  const { colors, isArcade } = useAppTheme();
  const { t } = useI18n();
  const isPickup = stop.type === "PICKUP";
  const accent = isPickup ? PingPointColors.cyan : PingPointColors.yellow;

  return (
    <View
      style={[
        styles.stopCard,
        {
          backgroundColor: colors.surface,
          borderColor: isArcade ? `${accent}40` : colors.border,
          borderRadius: colors.borderRadius,
        },
      ]}
    >
      <View style={styles.stopHeader}>
        <View style={[styles.stopBadge, { backgroundColor: `${accent}1f`, borderColor: accent }]}>
          <Feather name={isPickup ? "package" : "map-pin"} size={14} color={accent} />
          <ThemedText style={[styles.stopBadgeText, { color: accent }]}>
            {isPickup ? t("stop.pickup") : t("stop.delivery")}
          </ThemedText>
        </View>
        <ThemedText style={[styles.stopSeq, { color: colors.textMuted }]}>#{stop.sequence}</ThemedText>
      </View>

      {stop.companyName ? (
        <ThemedText style={[styles.stopCompany, { color: colors.textPrimary }]}>
          {stop.companyName}
        </ThemedText>
      ) : null}
      <ThemedText style={[styles.stopAddress, { color: colors.textSecondary }]}>
        {stop.fullAddress || stop.address || `${stop.city}, ${stop.state}`}
      </ThemedText>

      <View style={[styles.timesRow, { borderTopColor: colors.border }]}>
        <View style={styles.timeCol}>
          <ThemedText style={[styles.timeLabel, { color: colors.textMuted }]}>
            {t("historyDetail.arrived")}
          </ThemedText>
          <ThemedText style={[styles.timeValue, { color: colors.textPrimary }]}>
            {formatDateTime(stop.arrivedAt)}
          </ThemedText>
        </View>
        <View style={styles.timeCol}>
          <ThemedText style={[styles.timeLabel, { color: colors.textMuted }]}>
            {t("historyDetail.departed")}
          </ThemedText>
          <ThemedText style={[styles.timeValue, { color: colors.textPrimary }]}>
            {formatDateTime(stop.departedAt)}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

export default function HistoryDetailScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<HistoryDetailRouteProp>();
  const { colors, isArcade } = useAppTheme();
  const { t } = useI18n();

  const load = route.params?.load as HistoryLoad | undefined;
  if (!load) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title={t("historyDetail.title")} />
      </View>
    );
  }

  const lastStop = load.stops[load.stops.length - 1];
  const deliveredAt = load.deliveredAt || lastStop?.departedAt;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title={`LOAD #${load.loadNumber}`} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.refsCard,
            {
              backgroundColor: colors.surface,
              borderColor: isArcade ? "rgba(255, 215, 0, 0.25)" : colors.border,
              borderRadius: colors.borderRadius,
            },
          ]}
        >
          <ThemedText style={[styles.sectionTitle, { color: colors.textMuted }]}>
            {t("historyDetail.refs")}
          </ThemedText>
          <View style={styles.refRow}>
            <ThemedText style={[styles.refLabel, { color: colors.textSecondary }]}>
              {t("historyDetail.loadNumber")}
            </ThemedText>
            <ThemedText style={[styles.refValue, { color: PingPointColors.yellow }]}>
              {load.loadNumber}
            </ThemedText>
          </View>
          {load.customerRef ? (
            <View style={styles.refRow}>
              <ThemedText style={[styles.refLabel, { color: colors.textSecondary }]}>
                {t("historyDetail.customerRef")}
              </ThemedText>
              <ThemedText style={[styles.refValue, { color: colors.textPrimary }]}>
                {load.customerRef}
              </ThemedText>
            </View>
          ) : null}
          <View style={styles.refRow}>
            <ThemedText style={[styles.refLabel, { color: colors.textSecondary }]}>
              {t("historyDetail.status")}
            </ThemedText>
            <ThemedText style={[styles.refValue, { color: PingPointColors.cyan }]}>
              {load.status === "DELIVERED" ? t("history.delivered") : load.status}
            </ThemedText>
          </View>
          {deliveredAt ? (
            <View style={styles.refRow}>
              <ThemedText style={[styles.refLabel, { color: colors.textSecondary }]}>
                {t("historyDetail.deliveredAt")}
              </ThemedText>
              <ThemedText style={[styles.refValue, { color: colors.textPrimary }]}>
                {formatDateTime(deliveredAt)}
              </ThemedText>
            </View>
          ) : null}
        </View>

        <ThemedText style={[styles.sectionTitle, styles.stopsTitle, { color: colors.textMuted }]}>
          {t("historyDetail.stops")}
        </ThemedText>
        {load.stops.map((stop) => (
          <StopRow key={stop.id} stop={stop} />
        ))}
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
    gap: Spacing.md,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  refsCard: {
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.caption,
    fontWeight: "600",
    letterSpacing: 2,
  },
  stopsTitle: {
    marginTop: Spacing.sm,
  },
  refRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.md,
    minHeight: 28,
  },
  refLabel: {
    fontSize: 15,
  },
  refValue: {
    fontSize: 16,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  stopCard: {
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  stopHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stopBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  stopBadgeText: {
    ...Typography.badge,
  },
  stopSeq: {
    ...Typography.small,
    fontWeight: "600",
  },
  stopCompany: {
    fontSize: 17,
    fontWeight: "600",
  },
  stopAddress: {
    fontSize: 15,
    lineHeight: 21,
  },
  timesRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
    gap: Spacing.lg,
  },
  timeCol: {
    flex: 1,
  },
  timeLabel: {
    ...Typography.caption,
    letterSpacing: 1,
    marginBottom: 2,
  },
  timeValue: {
    fontSize: 15,
    fontWeight: "600",
  },
});
