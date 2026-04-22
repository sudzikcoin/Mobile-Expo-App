import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, FlatList, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/ThemedText";
import ScreenHeader from "@/components/ScreenHeader";
import EmptyState from "@/components/EmptyState";
import { PingPointColors, Spacing, BorderRadius, Typography, Shadows } from "@/constants/theme";
import { Load, Stop } from "@/lib/types";
import { getCompletedLoads, getDriverToken } from "@/lib/storage";
import { MOCK_COMPLETED_LOADS, formatDateTime } from "@/lib/mock-data";
import { useAppTheme } from "@/lib/theme-context";

import emptyHistoryImage from "@/assets/images/empty-history.png";

interface LoadHistoryItemProps {
  load: Load;
}

// Форматирует адрес стопа: предпочитает fullAddress, иначе city + state
function formatStopAddress(stop?: Stop): string {
  if (!stop) return "—";
  if (stop.fullAddress && stop.fullAddress.trim().length > 0) {
    return stop.fullAddress;
  }
  const city = stop.city || "";
  const state = stop.state || "";
  if (city && state) return `${city}, ${state}`;
  return city || state || "—";
}

function LoadHistoryItem({ load }: LoadHistoryItemProps) {
  const { colors, isArcade } = useAppTheme();

  // Origin: первый PICKUP стоп
  const pickupStop = load.stops.find((s) => s.type === "PICKUP");
  // Destination: последний DELIVERY стоп
  const deliveryStops = load.stops.filter((s) => s.type === "DELIVERY");
  const deliveryStop = deliveryStops[deliveryStops.length - 1];

  const originText = formatStopAddress(pickupStop);
  const destinationText = formatStopAddress(deliveryStop);

  // Дата доставки: load.deliveredAt, либо departedAt последнего стопа
  const lastStop = load.stops[load.stops.length - 1];
  const deliveredAt = load.deliveredAt || lastStop?.departedAt;

  return (
    <View style={[
      styles.loadCard,
      {
        backgroundColor: colors.surface,
        borderColor: isArcade ? "rgba(0, 217, 255, 0.2)" : colors.border,
        borderRadius: colors.borderRadius,
      }
    ]}>
      <View style={styles.loadHeader}>
        <ThemedText style={[styles.loadNumber, { color: isArcade ? PingPointColors.yellow : "#ffffff" }]}>LOAD #{load.loadNumber}</ThemedText>
        <View style={[styles.deliveredBadge, { backgroundColor: isArcade ? "rgba(0, 217, 255, 0.2)" : "rgba(255, 255, 255, 0.1)" }]}>
          <ThemedText style={[styles.deliveredText, { color: isArcade ? PingPointColors.cyan : "#ffffff" }]}>DELIVERED</ThemedText>
        </View>
      </View>

      <View style={styles.routeRow}>
        <ThemedText style={[styles.routeText, { color: colors.textPrimary }]} numberOfLines={2}>
          {originText}
        </ThemedText>
        <ThemedText style={[styles.arrow, { color: colors.textSecondary }]}>→</ThemedText>
        <ThemedText style={[styles.routeText, { color: colors.textPrimary }]} numberOfLines={2}>
          {destinationText}
        </ThemedText>
      </View>

      {deliveredAt ? (
        <ThemedText style={[styles.deliveredDate, { color: colors.textSecondary }]}>
          Completed: {formatDateTime(deliveredAt)}
        </ThemedText>
      ) : null}

      <View style={[styles.stopsInfo, { borderTopColor: colors.border }]}>
        <ThemedText style={[styles.stopsInfoText, { color: colors.textMuted }]}>
          {load.stops.length} stops
        </ThemedText>
      </View>
    </View>
  );
}

// Преобразует ответ сервера в структуру Load, используемую приложением.
// Сервер возвращает стопы с полями { type, fullAddress, city, state, arrivedAt, departedAt, ... }
function mapServerLoad(raw: any): Load {
  const rawStops: any[] = Array.isArray(raw?.stops) ? raw.stops : [];
  const stops: Stop[] = rawStops.map((s, idx) => ({
    id: String(s.id ?? idx),
    sequence: typeof s.sequence === "number" ? s.sequence : idx + 1,
    type: (s.type === "DELIVERY" ? "DELIVERY" : "PICKUP"),
    status: s.status === "ARRIVED" ? "ARRIVED" : s.status === "DEPARTED" ? "DEPARTED" : "PENDING",
    companyName: s.companyName || s.company || "",
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
    stops,
  };
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isArcade } = useAppTheme();
  const [loads, setLoads] = useState<Load[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    try {
      // 1) Пытаемся загрузить историю с сервера
      const token = await getDriverToken();
      if (token) {
        try {
          const url = `https://pingpoint.suverse.io/api/driver/${token}/history`;
          console.log("[History] Fetching from server:", url);
          const res = await fetch(url, {
            method: "GET",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              const mapped = data.map(mapServerLoad);
              console.log(`[History] Loaded ${mapped.length} loads from server`);
              setLoads(mapped);
              return;
            }
            console.log("[History] Server returned empty history, using fallback");
          } else {
            console.warn("[History] Server responded with", res.status);
          }
        } catch (serverErr) {
          console.warn("[History] Server fetch failed, using fallback:", serverErr);
        }
      } else {
        console.log("[History] No driver token — using local fallback");
      }

      // 2) Fallback: локальный AsyncStorage
      const completedLoads = await getCompletedLoads();
      if (completedLoads.length > 0) {
        setLoads(completedLoads);
      } else {
        setLoads(MOCK_COMPLETED_LOADS);
      }
    } catch (error) {
      console.error("Failed to load history:", error);
      setLoads(MOCK_COMPLETED_LOADS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  }, [loadHistory]);

  const renderItem = ({ item }: { item: Load }) => (
    <LoadHistoryItem load={item} />
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="History" />

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
              title="No Completed Loads"
              description="Your completed deliveries will appear here."
            />
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
  loadCard: {
    backgroundColor: PingPointColors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: PingPointColors.border,
  },
  loadCardArcade: {
    borderColor: "rgba(0, 217, 255, 0.2)",
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
    flexWrap: "wrap",
  },
  routeText: {
    ...Typography.body,
    color: PingPointColors.textPrimary,
    flex: 1,
  },
  arrow: {
    ...Typography.body,
    color: PingPointColors.textSecondary,
  },
  deliveredDate: {
    ...Typography.caption,
    color: PingPointColors.textSecondary,
    marginBottom: Spacing.sm,
  },
  stopsInfo: {
    borderTopWidth: 1,
    borderTopColor: PingPointColors.border,
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
  },
  stopsInfoText: {
    ...Typography.caption,
    color: PingPointColors.textMuted,
  },
});
