import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, FlatList, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import ScreenHeader from "@/components/ScreenHeader";
import EmptyState from "@/components/EmptyState";
import { PingPointColors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { LogEntry } from "@/lib/types";
import { getLogs } from "@/lib/storage";
import { useAppTheme } from "@/lib/theme-context";

import emptyLogsImage from "@/assets/images/empty-logs.png";

function getActionIcon(action: LogEntry["action"]): { name: keyof typeof Feather.glyphMap; color: string } {
  switch (action) {
    case "ARRIVE":
      return { name: "map-pin", color: PingPointColors.cyan };
    case "DEPART":
      return { name: "truck", color: PingPointColors.yellow };
    case "LOCATION_ENABLED":
      return { name: "navigation", color: PingPointColors.cyan };
    case "LOCATION_DISABLED":
      return { name: "navigation-2", color: PingPointColors.textMuted };
    case "LOCATION_PING":
      return { name: "radio", color: PingPointColors.purple };
    default:
      return { name: "activity", color: PingPointColors.textSecondary };
  }
}

function getActionLabel(action: LogEntry["action"]): string {
  switch (action) {
    case "ARRIVE":
      return "Arrived at stop";
    case "DEPART":
      return "Departed from stop";
    case "LOCATION_ENABLED":
      return "Location sharing enabled";
    case "LOCATION_DISABLED":
      return "Location sharing disabled";
    case "LOCATION_PING":
      return "Location sent";
    default:
      return action;
  }
}

function formatLogTime(isoString: string): { date: string; time: string } {
  const d = new Date(isoString);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return { date, time };
}

interface LogItemProps {
  log: LogEntry;
}

function LogItem({ log }: LogItemProps) {
  const { colors, isArcade } = useAppTheme();
  const icon = getActionIcon(log.action);
  const label = getActionLabel(log.action);
  const { date, time } = formatLogTime(log.timestamp);

  return (
    <View style={[
      styles.logCard, 
      { 
        backgroundColor: colors.surface,
        borderColor: isArcade ? "rgba(0, 217, 255, 0.15)" : colors.border,
        borderRadius: colors.borderRadius,
      }
    ]}>
      <View style={[styles.iconContainer, { backgroundColor: `${icon.color}20` }]}>
        <Feather name={icon.name} size={18} color={icon.color} />
      </View>

      <View style={styles.logContent}>
        <ThemedText style={[styles.logLabel, { color: colors.textPrimary }]}>{label}</ThemedText>
        {log.stopName ? (
          <ThemedText style={[styles.stopName, { color: colors.textSecondary }]}>{log.stopName}</ThemedText>
        ) : null}
        <View style={styles.timeRow}>
          <ThemedText style={[styles.logDate, { color: colors.textMuted }]}>{date}</ThemedText>
          <ThemedText style={[styles.logTime, { color: colors.textMuted }]}>{time}</ThemedText>
        </View>
      </View>
    </View>
  );
}

export default function LogsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isArcade } = useAppTheme();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    try {
      const savedLogs = await getLogs();
      setLogs(savedLogs);
    } catch (error) {
      console.error("Failed to load logs:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLogs();
    setRefreshing(false);
  }, [loadLogs]);

  const renderItem = ({ item }: { item: LogEntry }) => (
    <LogItem log={item} />
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Logs" />

      <FlatList
        data={logs}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + Spacing.xl },
          logs.length === 0 && styles.emptyListContent,
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
              image={emptyLogsImage}
              title="No Activity Yet"
              description="Your stop arrivals, departures, and location pings will be logged here."
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
    gap: Spacing.sm,
  },
  emptyListContent: {
    flex: 1,
  },
  logCard: {
    flexDirection: "row",
    backgroundColor: PingPointColors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: PingPointColors.border,
    gap: Spacing.md,
  },
  logCardArcade: {
    borderColor: "rgba(0, 217, 255, 0.15)",
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  logContent: {
    flex: 1,
  },
  logLabel: {
    ...Typography.body,
    fontWeight: "600",
    color: PingPointColors.textPrimary,
    marginBottom: 2,
  },
  stopName: {
    ...Typography.small,
    color: PingPointColors.textSecondary,
    marginBottom: Spacing.xs,
  },
  timeRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  logDate: {
    ...Typography.caption,
    color: PingPointColors.textMuted,
  },
  logTime: {
    ...Typography.caption,
    color: PingPointColors.textMuted,
    fontFamily: "monospace",
  },
});
