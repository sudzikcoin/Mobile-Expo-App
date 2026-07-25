import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, FlatList, RefreshControl, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import ScreenHeader from "@/components/ScreenHeader";
import EmptyState from "@/components/EmptyState";
import { PingPointColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { Load, Stop } from "@/lib/types";
import { getCompletedLoads, getActiveToken, isTruckToken } from "@/lib/storage";
import { useAppTheme } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n";

import emptyHistoryImage from "@/assets/images/empty-history.png";

const API_BASE = "https://pingpoint.suverse.io";
const PAGE_SIZE = 20;

// History rows carry the customer ref for the detail view; the base Load
// type doesn't have it.
export type HistoryLoad = Load & { customerRef?: string | null };

// Card line: "CITY, ST" — the compact in-cab form. Detail view shows the
// full addresses.
function cityState(stop?: Stop): string {
  if (!stop) return "—";
  const city = stop.city || "";
  const state = stop.state || "";
  if (city && state) return `${city}, ${state}`;
  return city || state || stop.fullAddress || "—";
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Преобразует ответ сервера в структуру Load, используемую приложением.
function mapServerLoad(raw: any): HistoryLoad {
  const rawStops: any[] = Array.isArray(raw?.stops) ? raw.stops : [];
  const stops: Stop[] = rawStops.map((s, idx) => ({
    id: String(s.id ?? idx),
    sequence: typeof s.sequence === "number" ? s.sequence : idx + 1,
    type: s.type === "DELIVERY" ? "DELIVERY" : "PICKUP",
    status: s.departedAt ? "DEPARTED" : s.arrivedAt ? "ARRIVED" : "PENDING",
    companyName: s.companyName || s.company || s.name || "",
    city: s.city || "",
    state: s.state || "",
    address: s.address || s.fullAddress || "",
    fullAddress: s.fullAddress || undefined,
    scheduledTime: s.windowFrom || s.scheduledTime || s.arrivedAt || s.departedAt || "",
    arrivedAt: s.arrivedAt || undefined,
    departedAt: s.departedAt || undefined,
  }));

  return {
    id: String(raw.id),
    loadNumber: String(raw.loadNumber ?? ""),
    status: raw.status === "IN_TRANSIT" ? "IN_TRANSIT" : raw.status === "DELIVERED" ? "DELIVERED" : "PLANNED",
    deliveredAt: raw.deliveredAt || undefined,
    customerRef: raw.customerRef ?? null,
    stops,
  };
}

function LoadHistoryItem({ load, onPress }: { load: HistoryLoad; onPress: () => void }) {
  const { colors, isArcade } = useAppTheme();
  const { t } = useI18n();

  const pickupStop = load.stops.find((s) => s.type === "PICKUP");
  const deliveryStops = load.stops.filter((s) => s.type === "DELIVERY");
  const deliveryStop = deliveryStops[deliveryStops.length - 1];

  const lastStop = load.stops[load.stops.length - 1];
  const deliveredAt = load.deliveredAt || lastStop?.departedAt;

  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.loadCard,
        {
          backgroundColor: colors.surface,
          borderColor: isArcade ? "rgba(255, 215, 0, 0.25)" : colors.border,
          borderRadius: colors.borderRadius,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={styles.loadHeader}>
        <ThemedText style={[styles.loadNumber, { color: isArcade ? PingPointColors.yellow : "#ffffff" }]}>
          LOAD #{load.loadNumber}
        </ThemedText>
        <View style={[styles.deliveredBadge, { backgroundColor: isArcade ? "rgba(0, 217, 255, 0.2)" : "rgba(255, 255, 255, 0.1)" }]}>
          <ThemedText style={[styles.deliveredText, { color: isArcade ? PingPointColors.cyan : "#ffffff" }]}>
            {t("history.delivered")}
          </ThemedText>
        </View>
      </View>

      <View style={styles.routeRow}>
        <ThemedText style={[styles.routeText, { color: colors.textPrimary }]} numberOfLines={1}>
          {cityState(pickupStop)}
        </ThemedText>
        <ThemedText style={[styles.arrow, { color: colors.textSecondary }]}>→</ThemedText>
        <ThemedText style={[styles.routeText, styles.routeTextRight, { color: colors.textPrimary }]} numberOfLines={1}>
          {cityState(deliveryStop)}
        </ThemedText>
      </View>

      <View style={styles.metaRow}>
        <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>
          {deliveredAt ? t("history.deliveredOn", { date: formatDate(deliveredAt) }) : ""}
        </ThemedText>
        <ThemedText style={[styles.metaText, { color: colors.textMuted }]}>
          {t("history.stopsCount", { n: load.stops.length })}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const [loads, setLoads] = useState<HistoryLoad[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Fetch one page of history. Truck tokens use the paginated
  // /api/truck/:token/history endpoint; legacy drv_* tokens fall back to
  // the older /api/driver/:token/history (single page, up to 50).
  const fetchPage = useCallback(async (offset: number): Promise<HistoryLoad[] | null> => {
    const token = await getActiveToken();
    if (!token) return null;
    const url = isTruckToken(token)
      ? `${API_BASE}/api/truck/${token}/history?limit=${PAGE_SIZE}&offset=${offset}`
      : `${API_BASE}/api/driver/${token}/history`;
    try {
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json", Accept: "application/json" },
      });
      if (!res.ok) {
        console.warn("[History] Server responded with", res.status);
        return null;
      }
      const data = await res.json();
      if (!Array.isArray(data)) return null;
      return data.map(mapServerLoad);
    } catch (err) {
      console.warn("[History] Server fetch failed:", err);
      return null;
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const page = await fetchPage(0);
      if (page !== null) {
        setLoads(page);
        setHasMore(page.length === PAGE_SIZE);
        return;
      }
      // Server unreachable: fall back to loads completed on this device
      // (real local records — the mocked demo list is gone in 1.8.6).
      const completedLoads = await getCompletedLoads();
      setLoads(completedLoads as HistoryLoad[]);
      setHasMore(false);
    } catch (error) {
      console.error("Failed to load history:", error);
      setLoads([]);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  }, [loadHistory]);

  const onLoadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(loads.length);
      if (page !== null) {
        // Dedup on id: a load delivered between page fetches shifts offsets.
        const seen = new Set(loads.map((l) => l.id));
        setLoads([...loads, ...page.filter((l) => !seen.has(l.id))]);
        setHasMore(page.length === PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, loads, loadingMore]);

  const renderItem = ({ item }: { item: HistoryLoad }) => (
    <LoadHistoryItem
      load={item}
      onPress={() => navigation.navigate("HistoryDetail", { load: item })}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t("history.title")} />

      <FlatList
        data={loads}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + Spacing.xl },
          loads.length === 0 && styles.emptyListContent,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PingPointColors.cyan}
            colors={[PingPointColors.cyan]}
          />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              image={emptyHistoryImage}
              title={t("history.emptyTitle")}
              description={t("history.emptyText")}
            />
          ) : null
        }
        ListFooterComponent={
          hasMore ? (
            <Pressable
              onPress={onLoadMore}
              disabled={loadingMore}
              style={({ pressed }) => [
                styles.loadMoreBtn,
                { borderRadius: colors.borderRadius },
                (pressed || loadingMore) && { opacity: 0.6 },
              ]}
            >
              <ThemedText style={styles.loadMoreText}>
                {loadingMore ? t("history.loading") : t("history.loadMore")}
              </ThemedText>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PingPointColors.background,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  emptyListContent: {
    flex: 1,
  },
  // In-cab standard: card is one big ≥56px tap target with 17px route text.
  loadCard: {
    backgroundColor: PingPointColors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: PingPointColors.border,
  },
  loadHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  loadNumber: {
    ...Typography.h4,
    color: PingPointColors.yellow,
    letterSpacing: 1,
  },
  deliveredBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0, 217, 255, 0.2)",
  },
  deliveredText: {
    ...Typography.badge,
    color: PingPointColors.cyan,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  routeText: {
    fontSize: 17,
    fontWeight: "600",
    color: PingPointColors.textPrimary,
    flexShrink: 1,
  },
  routeTextRight: {
    textAlign: "right",
  },
  arrow: {
    fontSize: 17,
    color: PingPointColors.textSecondary,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: PingPointColors.border,
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
  },
  metaText: {
    ...Typography.small,
  },
  loadMoreBtn: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.5)",
    backgroundColor: "rgba(255, 215, 0, 0.08)",
    marginTop: Spacing.sm,
  },
  loadMoreText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
    color: PingPointColors.yellow,
  },
});
