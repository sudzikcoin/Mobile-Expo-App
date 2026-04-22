import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing, BorderRadius, Typography, Shadows } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";
import {
  setTruckSetupComplete,
  setTruckId,
  setTruckNumber,
  setCompanyId,
  setDriverName,
} from "@/lib/storage";

const AGENTOS_BASE = "https://agentos.suverse.io";
const AGENTOS_KEY = process.env.EXPO_PUBLIC_AGENTOS_INTERNAL_KEY || "";

interface Company {
  id: string;
  name: string;
}

interface Truck {
  id: string;
  truckNumber: string;
  driverName: string;
}

interface TruckSetupScreenProps {
  onComplete: () => void;
}

export default function TruckSetupScreen({ onComplete }: TruckSetupScreenProps) {
  const insets = useSafeAreaInsets();
  const { isArcade } = useAppTheme();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newDriverName, setNewDriverName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Шаг 1 — загружаем список компаний
  useEffect(() => {
    if (step === 1) {
      loadCompanies();
    }
  }, [step]);

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${AGENTOS_BASE}/api/internal/companies`, {
        headers: { "x-internal-key": AGENTOS_KEY },
      });
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || data || []);
      }
    } catch (err) {
      console.error("[TruckSetup] Failed to load companies:", err);
      // Показываем заглушку если API недоступен
      setCompanies([{ id: "548fd10b-bb8a-4771-924c-ed3e863e498d", name: "Suverse Logistics" }]);
    } finally {
      setLoading(false);
    }
  };

  const loadTrucks = async (companyId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${AGENTOS_BASE}/api/internal/companies/${companyId}/trucks`, {
        headers: { "x-internal-key": AGENTOS_KEY },
      });
      if (res.ok) {
        const data = await res.json();
        setTrucks(data.trucks || data || []);
      }
    } catch (err) {
      console.error("[TruckSetup] Failed to load trucks:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCompany = (company: Company) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCompany(company);
    loadTrucks(company.id);
    setStep(2);
  };

  const handleSelectTruck = (truck: Truck) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTruck(truck);
    setNewDriverName(truck.driverName || "");
    setStep(3);
  };

  const handleSaveDriverName = async () => {
    if (!newDriverName.trim() || !selectedTruck) return;
    setSavingName(true);
    try {
      await fetch(`${AGENTOS_BASE}/api/internal/trucks/${selectedTruck.id}/driver`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": AGENTOS_KEY,
        },
        body: JSON.stringify({ driverName: newDriverName.trim() }),
      });
      setSelectedTruck({ ...selectedTruck, driverName: newDriverName.trim() });
      setEditingName(false);
    } catch (err) {
      console.error("[TruckSetup] Failed to save driver name:", err);
    } finally {
      setSavingName(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedTruck || !selectedCompany) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await setTruckId(selectedTruck.id);
      await setTruckNumber(selectedTruck.truckNumber);
      await setCompanyId(selectedCompany.id);
      await setDriverName(selectedTruck.driverName);
      await setTruckSetupComplete(true);
      onComplete();
    } catch (err) {
      console.error("[TruckSetup] Failed to save setup:", err);
      Alert.alert("Error", "Failed to save setup. Please try again.");
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl }]}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.logo}>PINGPOINT</ThemedText>
        <ThemedText style={styles.logoSub}>DRIVER</ThemedText>
      </View>

      {/* Step indicator */}
      <View style={styles.steps}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={[styles.stepDot, s <= step && styles.stepDotActive, isArcade && s <= step && styles.stepDotArcade]} />
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* STEP 1 — Выбор компании */}
        {step === 1 && (
          <View>
            <ThemedText style={styles.stepTitle}>SELECT COMPANY</ThemedText>
            <ThemedText style={styles.stepHint}>Choose your carrier company</ThemedText>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={PingPointColors.cyan} />
                <ThemedText style={styles.loadingText}>Loading companies...</ThemedText>
              </View>
            ) : (
              <View style={styles.list}>
                {companies.map((company) => (
                  <Pressable
                    key={company.id}
                    onPress={() => handleSelectCompany(company)}
                    style={({ pressed }) => [
                      styles.listItem,
                      isArcade && styles.listItemArcade,
                      pressed && styles.listItemPressed,
                    ]}
                  >
                    <Feather name="briefcase" size={20} color={PingPointColors.cyan} />
                    <ThemedText style={styles.listItemText}>{company.name}</ThemedText>
                    <Feather name="chevron-right" size={18} color={PingPointColors.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* STEP 2 — Выбор трака */}
        {step === 2 && (
          <View>
            <Pressable onPress={() => setStep(1)} style={styles.backButton}>
              <Feather name="arrow-left" size={18} color={PingPointColors.cyan} />
              <ThemedText style={styles.backText}>{selectedCompany?.name}</ThemedText>
            </Pressable>

            <ThemedText style={styles.stepTitle}>SELECT TRUCK</ThemedText>
            <ThemedText style={styles.stepHint}>Choose your truck number</ThemedText>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={PingPointColors.cyan} />
                <ThemedText style={styles.loadingText}>Loading trucks...</ThemedText>
              </View>
            ) : trucks.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="truck" size={40} color={PingPointColors.textMuted} />
                <ThemedText style={styles.emptyText}>No trucks found</ThemedText>
                <ThemedText style={styles.emptyHint}>Contact your dispatcher</ThemedText>
              </View>
            ) : (
              <View style={styles.list}>
                {trucks.map((truck) => (
                  <Pressable
                    key={truck.id}
                    onPress={() => handleSelectTruck(truck)}
                    style={({ pressed }) => [
                      styles.listItem,
                      isArcade && styles.listItemArcade,
                      pressed && styles.listItemPressed,
                    ]}
                  >
                    <Feather name="truck" size={20} color={PingPointColors.cyan} />
                    <View style={styles.listItemContent}>
                      <ThemedText style={styles.listItemText}>Truck {truck.truckNumber}</ThemedText>
                      <ThemedText style={styles.listItemSub}>{truck.driverName || "No driver assigned"}</ThemedText>
                    </View>
                    <Feather name="chevron-right" size={18} color={PingPointColors.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* STEP 3 — Подтверждение */}
        {step === 3 && selectedTruck && (
          <View>
            <Pressable onPress={() => setStep(2)} style={styles.backButton}>
              <Feather name="arrow-left" size={18} color={PingPointColors.cyan} />
              <ThemedText style={styles.backText}>Back to trucks</ThemedText>
            </Pressable>

            <ThemedText style={styles.stepTitle}>CONFIRM</ThemedText>
            <ThemedText style={styles.stepHint}>Is this your truck?</ThemedText>

            {/* Карточка трака */}
            <View style={[styles.confirmCard, isArcade && styles.confirmCardArcade]}>
              <View style={styles.confirmIconRow}>
                <Feather name="truck" size={40} color={PingPointColors.cyan} />
              </View>
              <ThemedText style={styles.confirmTruckNumber}>TRUCK {selectedTruck.truckNumber}</ThemedText>

              {editingName ? (
                <View style={styles.editNameContainer}>
                  <TextInput
                    style={styles.nameInput}
                    value={newDriverName}
                    onChangeText={setNewDriverName}
                    placeholder="Enter driver name"
                    placeholderTextColor={PingPointColors.textMuted}
                    autoFocus
                  />
                  <View style={styles.editButtons}>
                    <Pressable
                      onPress={() => setEditingName(false)}
                      style={[styles.editBtn, styles.editBtnCancel]}
                    >
                      <ThemedText style={styles.editBtnText}>Cancel</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={handleSaveDriverName}
                      style={[styles.editBtn, styles.editBtnSave, isArcade && Shadows.arcade.cyan]}
                      disabled={savingName}
                    >
                      {savingName ? (
                        <ActivityIndicator size="small" color={PingPointColors.background} />
                      ) : (
                        <ThemedText style={[styles.editBtnText, styles.editBtnSaveText]}>Save</ThemedText>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.driverRow}>
                  <ThemedText style={styles.confirmDriverName}>{selectedTruck.driverName || "No driver"}</ThemedText>
                  <Pressable onPress={() => setEditingName(true)} style={styles.editIcon}>
                    <Feather name="edit-2" size={16} color={PingPointColors.textMuted} />
                  </Pressable>
                </View>
              )}
            </View>

            {/* Кнопки */}
            <Pressable
              onPress={handleConfirm}
              style={({ pressed }) => [
                styles.confirmButton,
                isArcade && Shadows.arcade.cyan,
                pressed && styles.confirmButtonPressed,
              ]}
            >
              <Feather name="check" size={20} color={PingPointColors.background} />
              <ThemedText style={styles.confirmButtonText}>CONFIRM & START</ThemedText>
            </Pressable>

            <ThemedText style={styles.editHint}>
              Not you? Tap the pencil icon to update driver name.
            </ThemedText>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PingPointColors.background,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  logo: {
    fontSize: 32,
    fontWeight: "700",
    color: PingPointColors.cyan,
    letterSpacing: 4,
  },
  logoSub: {
    fontSize: 14,
    fontWeight: "600",
    color: PingPointColors.textSecondary,
    letterSpacing: 6,
    marginTop: -4,
  },
  steps: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing["2xl"],
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PingPointColors.border,
  },
  stepDotActive: {
    backgroundColor: PingPointColors.textSecondary,
  },
  stepDotArcade: {
    backgroundColor: PingPointColors.cyan,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing["4xl"],
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: PingPointColors.textPrimary,
    letterSpacing: 2,
    marginBottom: Spacing.xs,
  },
  stepHint: {
    ...Typography.body,
    color: PingPointColors.textMuted,
    marginBottom: Spacing["2xl"],
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: Spacing["4xl"],
    gap: Spacing.md,
  },
  loadingText: {
    color: PingPointColors.textMuted,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: Spacing["4xl"],
    gap: Spacing.md,
  },
  emptyText: {
    ...Typography.h4,
    color: PingPointColors.textSecondary,
  },
  emptyHint: {
    color: PingPointColors.textMuted,
  },
  list: {
    gap: Spacing.sm,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PingPointColors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: PingPointColors.border,
    gap: Spacing.md,
  },
  listItemArcade: {
    borderColor: "rgba(0, 217, 255, 0.2)",
  },
  listItemPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  listItemContent: {
    flex: 1,
  },
  listItemText: {
    ...Typography.body,
    color: PingPointColors.textPrimary,
    fontWeight: "600",
  },
  listItemSub: {
    ...Typography.small,
    color: PingPointColors.textSecondary,
    marginTop: 2,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  backText: {
    color: PingPointColors.cyan,
    ...Typography.body,
  },
  confirmCard: {
    backgroundColor: PingPointColors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing["2xl"],
    borderWidth: 1,
    borderColor: PingPointColors.border,
    alignItems: "center",
    marginBottom: Spacing["2xl"],
    gap: Spacing.md,
  },
  confirmCardArcade: {
    borderColor: "rgba(0, 217, 255, 0.3)",
    backgroundColor: "rgba(0, 217, 255, 0.05)",
  },
  confirmIconRow: {
    marginBottom: Spacing.sm,
  },
  confirmTruckNumber: {
    fontSize: 28,
    fontWeight: "700",
    color: PingPointColors.cyan,
    letterSpacing: 3,
  },
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  confirmDriverName: {
    ...Typography.h4,
    color: PingPointColors.textSecondary,
  },
  editIcon: {
    padding: Spacing.xs,
  },
  editNameContainer: {
    width: "100%",
    gap: Spacing.sm,
  },
  nameInput: {
    backgroundColor: PingPointColors.surfaceLight,
    borderWidth: 1,
    borderColor: PingPointColors.cyan,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    color: PingPointColors.textPrimary,
    fontSize: 16,
    textAlign: "center",
  },
  editButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  editBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  editBtnCancel: {
    backgroundColor: PingPointColors.border,
  },
  editBtnSave: {
    backgroundColor: PingPointColors.cyan,
  },
  editBtnText: {
    ...Typography.button,
    color: PingPointColors.textPrimary,
  },
  editBtnSaveText: {
    color: PingPointColors.background,
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: PingPointColors.cyan,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  confirmButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  confirmButtonText: {
    ...Typography.button,
    color: PingPointColors.background,
    fontSize: 16,
  },
  editHint: {
    ...Typography.caption,
    color: PingPointColors.textMuted,
    textAlign: "center",
  },
});
