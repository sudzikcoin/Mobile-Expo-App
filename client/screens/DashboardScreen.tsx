import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";

import { ThemedText } from "@/components/ThemedText";
import DashboardHeader from "@/components/DashboardHeader";
import LoadCard from "@/components/LoadCard";
import StopCard from "@/components/StopCard";
import RewardAnimation from "@/components/RewardAnimation";
import { PingPointColors, Spacing } from "@/constants/theme";
import { Load, Stop } from "@/lib/types";
import { MOCK_LOAD, isStopCurrent } from "@/lib/mock-data";
import {
  getDriverBalance,
  addToBalance,
  getCurrentLoad,
  setCurrentLoad,
  addCompletedLoad,
  isLocationEnabled as getLocationEnabled,
  setLocationEnabled as setStorageLocationEnabled,
  addLog,
} from "@/lib/storage";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [balance, setBalance] = useState(70);
  const [load, setLoad] = useState<Load | null>(null);
  const [isLocationEnabled, setIsLocationEnabled] = useState(false);
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rewardPoints, setRewardPoints] = useState(0);
  const [showReward, setShowReward] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [savedBalance, savedLoad, locationEnabled] = await Promise.all([
        getDriverBalance(),
        getCurrentLoad(),
        getLocationEnabled(),
      ]);

      setBalance(savedBalance);
      setIsLocationEnabled(locationEnabled);

      if (savedLoad) {
        setLoad(savedLoad);
      } else {
        setLoad(MOCK_LOAD);
        await setCurrentLoad(MOCK_LOAD);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
      setLoad(MOCK_LOAD);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleToggleLocation = async () => {
    setIsLocationLoading(true);

    try {
      if (!isLocationEnabled) {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== "granted") {
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
          setIsLocationLoading(false);
          return;
        }

        await setStorageLocationEnabled(true);
        await addLog({ action: "LOCATION_ENABLED" });
        setIsLocationEnabled(true);

        const newBalance = await addToBalance(10);
        setBalance(newBalance);
        setRewardPoints(10);
        setShowReward(true);
      } else {
        await setStorageLocationEnabled(false);
        await addLog({ action: "LOCATION_DISABLED" });
        setIsLocationEnabled(false);
      }
    } catch (error) {
      console.error("Failed to toggle location:", error);
    } finally {
      setIsLocationLoading(false);
    }
  };

  const handleStopAction = async (stopId: string, action: "arrive" | "depart") => {
    if (!load) return;

    try {
      const updatedStops = load.stops.map((stop) => {
        if (stop.id === stopId) {
          if (action === "arrive") {
            return {
              ...stop,
              status: "ARRIVED" as const,
              arrivedAt: new Date().toISOString(),
            };
          } else {
            return {
              ...stop,
              status: "DEPARTED" as const,
              departedAt: new Date().toISOString(),
            };
          }
        }
        return stop;
      });

      const currentStop = load.stops.find((s) => s.id === stopId);
      await addLog({
        action: action === "arrive" ? "ARRIVE" : "DEPART",
        stopId,
        stopName: currentStop?.companyName,
      });

      const allDeparted = updatedStops.every((s) => s.status === "DEPARTED");
      const updatedLoadStatus = allDeparted ? "DELIVERED" : "IN_TRANSIT";

      const updatedLoad: Load = {
        ...load,
        status: updatedLoadStatus,
        stops: updatedStops,
      };

      setLoad(updatedLoad);
      await setCurrentLoad(updatedLoad);

      const points = action === "arrive" ? 10 : 20;
      const newBalance = await addToBalance(points);
      setBalance(newBalance);
      setRewardPoints(points);
      setShowReward(true);

      if (allDeparted) {
        await addCompletedLoad(updatedLoad);
        await setCurrentLoad(null);

        setTimeout(() => {
          setLoad(null);
        }, 2000);
      }
    } catch (error) {
      console.error("Failed to update stop:", error);
    }
  };

  const handleRewardComplete = () => {
    setShowReward(false);
    setRewardPoints(0);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <DashboardHeader balance={balance} />
        <View style={styles.loadingContainer}>
          <ThemedText style={styles.loadingText}>Loading...</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <DashboardHeader balance={balance} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
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
      >
        {load ? (
          <>
            <LoadCard
              load={load}
              isLocationEnabled={isLocationEnabled}
              isLocationLoading={isLocationLoading}
              onToggleLocation={handleToggleLocation}
            />

            <View style={styles.stopsSection}>
              <ThemedText style={styles.sectionTitle}>STOPS</ThemedText>
              <View style={styles.stopsList}>
                {load.stops.map((stop) => (
                  <StopCard
                    key={stop.id}
                    stop={stop}
                    isCurrent={isStopCurrent(stop, load.stops)}
                    onAction={handleStopAction}
                  />
                ))}
              </View>
            </View>
          </>
        ) : (
          <View style={styles.noLoadContainer}>
            <ThemedText style={styles.noLoadTitle}>No Active Load</ThemedText>
            <ThemedText style={styles.noLoadText}>
              Pull down to refresh when you have a new assignment.
            </ThemedText>
          </View>
        )}
      </ScrollView>

      <RewardAnimation
        points={rewardPoints}
        visible={showReward}
        onComplete={handleRewardComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PingPointColors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: PingPointColors.textSecondary,
  },
  stopsSection: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: PingPointColors.textMuted,
    letterSpacing: 2,
    marginBottom: Spacing.xs,
  },
  stopsList: {
    gap: Spacing.md,
  },
  noLoadContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["5xl"],
  },
  noLoadTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: PingPointColors.textSecondary,
    marginBottom: Spacing.md,
  },
  noLoadText: {
    fontSize: 16,
    color: PingPointColors.textMuted,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
});
