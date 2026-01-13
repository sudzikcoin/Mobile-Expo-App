import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, FlatList, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/ThemedText";
import ScreenHeader from "@/components/ScreenHeader";
import EmptyState from "@/components/EmptyState";
import { PingPointColors, Spacing, BorderRadius, Typography, Shadows } from "@/constants/theme";
import { Load } from "@/lib/types";
import { getCompletedLoads } from "@/lib/storage";
import { MOCK_COMPLETED_LOADS, formatDateTime } from "@/lib/mock-data";
import { useAppTheme } from "@/lib/theme-context";

import emptyHistoryImage from "@/assets/images/empty-history.png";

interface LoadHistoryItemProps {
  load: Load;
  isArcade: boolean;
}

function LoadHistoryItem({ load, isArcade }: LoadHistoryItemProps) {
  const lastStop = load.stops[load.stops.length - 1];
  const deliveredAt = lastStop?.departedAt;

  return (
    <View style={[styles.loadCard, isArcade && styles.loadCardArcade]}>
      <View style={styles.loadHeader}>
        <ThemedText style={styles.loadNumber}>LOAD #{load.loadNumber}</ThemedText>
        <View style={styles.deliveredBadge}>
          <ThemedText style={styles.deliveredText}>DELIVERED</ThemedText>
        </View>
      </View>

      <View style={styles.routeRow}>
        <ThemedText style={styles.routeText}>
          {load.originCity}, {load.originState}
        </ThemedText>
        <ThemedText style={styles.arrow}>→</ThemedText>
        <ThemedText style={styles.routeText}>
          {load.destinationCity}, {load.destinationState}
        </ThemedText>
      </View>

      {deliveredAt ? (
        <ThemedText style={styles.deliveredDate}>
          Completed: {formatDateTime(deliveredAt)}
        </ThemedText>
      ) : null}

      <View style={styles.stopsInfo}>
        <ThemedText style={styles.stopsInfoText}>
          {load.stops.length} stops
        </ThemedText>
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { appTheme } = useAppTheme();
  const isArcade = appTheme === "arcade";
  const [loads, setLoads] = useState<Load[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    try {
      const completedLoads = await getCompletedLoads();
      if (completedLoads.length === 0) {
        setLoads(MOCK_COMPLETED_LOADS);
      } else {
        setLoads(completedLoads);
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
    <LoadHistoryItem load={item} isArcade={isArcade} />
  );

  return (
    <View style={styles.container}>
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
  },
  routeText: {
    ...Typography.body,
    color: PingPointColors.textPrimary,
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
