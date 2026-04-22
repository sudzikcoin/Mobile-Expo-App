import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Platform,
} from "react-native";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing, BorderRadius } from "@/constants/theme";
import type { DrawerParamList } from "@/navigation/DrawerNavigator";
import { useDriver } from "@/lib/driver-context";
import { Load as DriverLoad, Stop } from "@/lib/types";

// Структура от эндпоинта /api/loads/:id (коммерческий вид груза — используется при переходе с диспатча)
interface LoadDetailsData {
  id: string;
  origin?: string;
  destination?: string;
  rate?: number;
  commodity?: string;
  weight?: number;
  equipmentType?: string;
  brokerName?: string;
  brokerPhone?: string;
  brokerEmail?: string;
  pickupTime?: string;
  deliveryTime?: string;
  status?: "available" | "accepted" | "in_transit" | "completed";
  createdAt?: string;
  estimatedMiles?: number;
  // Стопы могут прийти с сервера — тогда используем их (с fullAddress)
  stops?: Array<{
    id: string;
    type: "PICKUP" | "DELIVERY";
    sequence?: number;
    companyName?: string;
    city?: string;
    state?: string;
    address?: string;
    fullAddress?: string;
    windowFrom?: string;
    arrivedAt?: string | null;
    departedAt?: string | null;
  }>;
}

type LoadDetailsRouteProp = RouteProp<DrawerParamList, "LoadDetails">;

// Возвращает строку для адреса стопа: fullAddress → city, state → city
function formatStopAddress(stop: {
  fullAddress?: string;
  city?: string;
  state?: string;
  address?: string;
}): string {
  if (stop.fullAddress && stop.fullAddress.trim().length > 0) return stop.fullAddress;
  if (stop.address && stop.address.trim().length > 0) return stop.address;
  const city = stop.city || "";
  const state = stop.state || "";
  if (city && state) return `${city}, ${state}`;
  return city || state || "—";
}

export default function LoadDetailsScreen() {
  const route = useRoute<LoadDetailsRouteProp>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { load: driverLoad } = useDriver();

  const [load, setLoad] = useState<LoadDetailsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  // Если loadId не передан явно — используем id текущего активного груза из driver-context
  const loadId = route.params?.loadId || driverLoad?.id;

  useEffect(() => {
    // Нет никакого loadId и нет активного груза — показываем сообщение
    if (!loadId) {
      setError("No active load");
      setIsLoading(false);
      return;
    }

    const fetchLoad = async () => {
      try {
        setIsLoading(true);
        setError(null);

        console.log("[LoadDetails] Fetching load:", loadId);

        const response = await fetch(
          `https://pingpoint.suverse.io/api/loads/${loadId}`
        );

        if (!response.ok) {
          // Сервер не вернул груз — если есть активный груз в контексте, используем его как fallback
          if (driverLoad && driverLoad.id === loadId) {
            console.log("[LoadDetails] Falling back to driver-context load");
            setLoad(buildFromDriverLoad(driverLoad));
            return;
          }
          throw new Error(
            `Failed to fetch load: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        console.log("[LoadDetails] Load fetched successfully");
        setLoad(data);
      } catch (err) {
        // В случае сетевой ошибки — используем данные из driver-context если доступны
        if (driverLoad && driverLoad.id === loadId) {
          console.log("[LoadDetails] Using driver-context load after error");
          setLoad(buildFromDriverLoad(driverLoad));
          return;
        }
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setError(errorMsg);
        console.error("[LoadDetails] Error fetching load:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLoad();
  }, [loadId, driverLoad]);

  const handleAcceptLoad = async () => {
    if (!load) return;

    try {
      setIsAccepting(true);

      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      console.log("[LoadDetails] Accepting load:", load.id);

      const response = await fetch(
        `https://pingpoint.suverse.io/api/loads/${load.id}/accept`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            timestamp: new Date().toISOString(),
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || `Failed to accept load: ${response.statusText}`
        );
      }

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      console.log("[LoadDetails] Load accepted successfully");

      navigation.reset({
        index: 0,
        routes: [
          {
            name: "Main" as never,
            params: {
              screen: "Dashboard",
            } as never,
          },
        ],
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to accept load";
      setError(errorMsg);
      console.error("[LoadDetails] Error accepting load:", err);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setIsAccepting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={PingPointColors.cyan} />
        <ThemedText style={styles.loadingText}>Loading load...</ThemedText>
      </View>
    );
  }

  if (error || !load) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Feather name="alert-circle" size={48} color={PingPointColors.error} />
        <ThemedText style={styles.errorText}>
          {error || "Load not found"}
        </ThemedText>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
        </Pressable>
      </View>
    );
  }

  // Собираем адреса для карточки маршрута из stops (предпочтительно) либо из origin/destination
  const pickupStopData = load.stops?.find((s) => s.type === "PICKUP");
  const deliveryStops = load.stops?.filter((s) => s.type === "DELIVERY") || [];
  const deliveryStopData = deliveryStops[deliveryStops.length - 1];

  const originDisplay = pickupStopData
    ? formatStopAddress(pickupStopData)
    : load.origin || "—";
  const destinationDisplay = deliveryStopData
    ? formatStopAddress(deliveryStopData)
    : load.destination || "—";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.backIcon,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Feather name="chevron-left" size={28} color={PingPointColors.cyan} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>LOAD DETAILS</ThemedText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.routeCard}>
          <View style={styles.locationRow}>
            <View style={[styles.locationIcon, styles.pickupIcon]}>
              <Feather
                name="map-pin"
                size={20}
                color={PingPointColors.success}
              />
            </View>
            <View style={styles.locationInfo}>
              <ThemedText style={styles.label}>PICKUP</ThemedText>
              <ThemedText style={styles.locationText}>{originDisplay}</ThemedText>
              {load.pickupTime ? (
                <ThemedText style={styles.timeText}>{load.pickupTime}</ThemedText>
              ) : null}
            </View>
          </View>

          <View style={styles.routeDivider} />

          <View style={styles.locationRow}>
            <View style={[styles.locationIcon, styles.deliveryIcon]}>
              <Feather name="flag" size={20} color={PingPointColors.error} />
            </View>
            <View style={styles.locationInfo}>
              <ThemedText style={styles.label}>DELIVERY</ThemedText>
              <ThemedText style={styles.locationText}>
                {destinationDisplay}
              </ThemedText>
              {load.deliveryTime ? (
                <ThemedText style={styles.timeText}>{load.deliveryTime}</ThemedText>
              ) : null}
            </View>
          </View>

          {load.estimatedMiles ? (
            <View style={styles.milesInfo}>
              <Feather name="navigation" size={16} color={PingPointColors.cyan} />
              <ThemedText style={styles.milesText}>
                ~{load.estimatedMiles} miles
              </ThemedText>
            </View>
          ) : null}
        </View>

        {/* Список всех стопов с полными адресами, если они есть в ответе сервера */}
        {load.stops && load.stops.length > 0 ? (
          <View style={styles.infoCard}>
            <ThemedText style={styles.cardTitle}>STOPS</ThemedText>
            {load.stops.map((stop, idx) => (
              <View
                key={stop.id || `stop-${idx}`}
                style={[
                  styles.stopRow,
                  idx < load.stops!.length - 1 && styles.stopRowDivider,
                ]}
              >
                <View style={styles.stopRowHeader}>
                  <View
                    style={[
                      styles.stopTypeBadge,
                      stop.type === "DELIVERY" && styles.stopTypeBadgeDelivery,
                    ]}
                  >
                    <ThemedText style={styles.stopTypeText}>{stop.type}</ThemedText>
                  </View>
                  {stop.companyName ? (
                    <ThemedText style={styles.stopCompany}>{stop.companyName}</ThemedText>
                  ) : null}
                </View>
                <ThemedText style={styles.stopAddress}>
                  {formatStopAddress(stop)}
                </ThemedText>
              </View>
            ))}
          </View>
        ) : null}

        {load.rate || load.commodity || load.weight || load.equipmentType ? (
          <View style={styles.infoCard}>
            <ThemedText style={styles.cardTitle}>COMMERCIAL INFO</ThemedText>

            {load.rate ? (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Rate</ThemedText>
                <ThemedText style={styles.rateValue}>${load.rate}</ThemedText>
              </View>
            ) : null}

            {load.commodity ? (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Commodity</ThemedText>
                <ThemedText style={styles.infoValue}>{load.commodity}</ThemedText>
              </View>
            ) : null}

            {load.weight ? (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Weight</ThemedText>
                <ThemedText style={styles.infoValue}>
                  {(load.weight / 1000).toFixed(1)} tons
                </ThemedText>
              </View>
            ) : null}

            {load.equipmentType ? (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Equipment</ThemedText>
                <ThemedText style={styles.infoValue}>{load.equipmentType}</ThemedText>
              </View>
            ) : null}
          </View>
        ) : null}

        {load.brokerName || load.brokerPhone || load.brokerEmail ? (
          <View style={styles.infoCard}>
            <ThemedText style={styles.cardTitle}>BROKER</ThemedText>

            {load.brokerName ? (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Company</ThemedText>
                <ThemedText style={styles.infoValue}>{load.brokerName}</ThemedText>
              </View>
            ) : null}

            {load.brokerPhone ? (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Phone</ThemedText>
                <Pressable>
                  <ThemedText style={[styles.infoValue, styles.linkText]}>
                    {load.brokerPhone}
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}

            {load.brokerEmail ? (
              <View style={styles.infoRow}>
                <ThemedText style={styles.infoLabel}>Email</ThemedText>
                <Pressable>
                  <ThemedText style={[styles.infoValue, styles.linkText]}>
                    {load.brokerEmail}
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {load.status ? (
          <View
            style={[
              styles.statusBadge,
              load.status === "available" && styles.statusAvailable,
              load.status === "accepted" && styles.statusAccepted,
              load.status === "in_transit" && styles.statusInTransit,
              load.status === "completed" && styles.statusCompleted,
            ]}
          >
            <ThemedText style={styles.statusText}>
              Status: {load.status.toUpperCase().replace("_", " ")}
            </ThemedText>
          </View>
        ) : null}
      </ScrollView>

      {load.status === "available" ? (
        <Pressable
          style={[
            styles.acceptButton,
            isAccepting && styles.acceptButtonDisabled,
          ]}
          onPress={handleAcceptLoad}
          disabled={isAccepting}
        >
          {isAccepting ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <Feather name="check-circle" size={20} color="#000" />
              <ThemedText style={styles.acceptButtonText}>Accept Load</ThemedText>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

// Строит данные для экрана из активного груза водителя (когда сервер недоступен или эндпоинт /api/loads/:id не отвечает)
function buildFromDriverLoad(dl: DriverLoad): LoadDetailsData {
  const stops = (dl.stops || []).map((s: Stop) => ({
    id: s.id,
    type: s.type,
    sequence: s.sequence,
    companyName: s.companyName,
    city: s.city,
    state: s.state,
    address: s.address,
    fullAddress: s.fullAddress,
    windowFrom: s.scheduledTime,
    arrivedAt: s.arrivedAt,
    departedAt: s.departedAt,
  }));

  const pickupStop = stops.find((s) => s.type === "PICKUP");
  const deliveryStops = stops.filter((s) => s.type === "DELIVERY");
  const deliveryStop = deliveryStops[deliveryStops.length - 1];

  const originDisplay = pickupStop
    ? (pickupStop.fullAddress || `${pickupStop.city || ""}, ${pickupStop.state || ""}`.replace(/^, |, $/, ""))
    : undefined;
  const destinationDisplay = deliveryStop
    ? (deliveryStop.fullAddress || `${deliveryStop.city || ""}, ${deliveryStop.state || ""}`.replace(/^, |, $/, ""))
    : undefined;

  return {
    id: dl.id,
    origin: originDisplay,
    destination: destinationDisplay,
    stops,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PingPointColors.background,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.lg,
    color: PingPointColors.textSecondary,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: PingPointColors.border,
  },
  backIcon: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: PingPointColors.cyan,
    letterSpacing: 1.5,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
    paddingBottom: Spacing["4xl"],
  },
  routeCard: {
    backgroundColor: PingPointColors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: PingPointColors.border,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  locationIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
    marginTop: 2,
  },
  pickupIcon: {
    backgroundColor: "rgba(76, 175, 80, 0.15)",
  },
  deliveryIcon: {
    backgroundColor: "rgba(244, 67, 54, 0.15)",
  },
  locationInfo: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: PingPointColors.textSecondary,
    marginBottom: Spacing.xs,
    letterSpacing: 0.5,
  },
  locationText: {
    fontSize: 15,
    fontWeight: "700",
    color: PingPointColors.textPrimary,
    marginBottom: Spacing.xs,
  },
  timeText: {
    fontSize: 12,
    color: PingPointColors.cyan,
    fontWeight: "500",
  },
  routeDivider: {
    height: 1,
    backgroundColor: PingPointColors.border,
    marginVertical: Spacing.lg,
    marginLeft: 44 + Spacing.md,
  },
  milesInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: PingPointColors.border,
  },
  milesText: {
    marginLeft: Spacing.sm,
    color: PingPointColors.cyan,
    fontWeight: "600",
  },
  infoCard: {
    backgroundColor: PingPointColors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: PingPointColors.border,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: PingPointColors.cyan,
    marginBottom: Spacing.md,
    letterSpacing: 1,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  infoLabel: {
    fontSize: 13,
    color: PingPointColors.textSecondary,
    fontWeight: "500",
  },
  infoValue: {
    fontSize: 13,
    color: PingPointColors.textPrimary,
    fontWeight: "600",
    textAlign: "right",
  },
  linkText: {
    color: PingPointColors.cyan,
  },
  rateValue: {
    fontSize: 18,
    color: PingPointColors.success,
    fontWeight: "700",
  },
  stopRow: {
    paddingVertical: Spacing.sm,
  },
  stopRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: PingPointColors.border,
  },
  stopRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  stopTypeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: "rgba(0, 217, 255, 0.2)",
  },
  stopTypeBadgeDelivery: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
  },
  stopTypeText: {
    fontSize: 10,
    fontWeight: "700",
    color: PingPointColors.textPrimary,
    letterSpacing: 0.5,
  },
  stopCompany: {
    fontSize: 13,
    fontWeight: "600",
    color: PingPointColors.textPrimary,
    flex: 1,
  },
  stopAddress: {
    fontSize: 13,
    color: PingPointColors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  statusAvailable: {
    borderColor: PingPointColors.success,
    backgroundColor: "rgba(76, 175, 80, 0.1)",
    borderWidth: 1,
  },
  statusAccepted: {
    borderColor: PingPointColors.cyan,
    backgroundColor: "rgba(0, 217, 255, 0.1)",
    borderWidth: 1,
  },
  statusInTransit: {
    borderColor: PingPointColors.warning,
    backgroundColor: "rgba(255, 193, 7, 0.1)",
    borderWidth: 1,
  },
  statusCompleted: {
    borderColor: PingPointColors.textSecondary,
    backgroundColor: "rgba(158, 158, 158, 0.1)",
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: PingPointColors.textPrimary,
    textAlign: "center",
  },
  acceptButton: {
    flexDirection: "row",
    backgroundColor: PingPointColors.success,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  acceptButtonDisabled: {
    opacity: 0.7,
  },
  acceptButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  backButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: PingPointColors.cyan,
  },
  backButtonText: {
    color: PingPointColors.cyan,
    fontWeight: "600",
    textAlign: "center",
  },
  errorText: {
    marginTop: Spacing.lg,
    fontSize: 16,
    textAlign: "center",
    color: PingPointColors.error,
    marginHorizontal: Spacing.lg,
  },
});
