import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing, BorderRadius, Typography, Shadows } from "@/constants/theme";
import { useDriver } from "@/lib/driver-context";
import {
  setTruckId,
  setTruckNumber,
  setCompanyId,
  setDriverName,
  setTruckSetupComplete,
} from "@/lib/storage";

const AGENTOS_KEY = process.env.EXPO_PUBLIC_AGENTOS_INTERNAL_KEY ?? "";
const PINGPOINT_KEY = process.env.EXPO_PUBLIC_PINGPOINT_INTERNAL_KEY ?? "";
const AGENTOS_BASE = "https://agentos.suverse.io/api/internal";
const PINGPOINT_BASE = "https://pingpoint.suverse.io/api/internal";

interface Company {
  id: string;
  name: string;
}

interface Truck {
  id: string;
  truckNumber: string;
  driverName: string;
}

export default function TruckSetupScreen() {
  const insets = useSafeAreaInsets();
  const { completeTruckSetup } = useDriver();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [newDriverName, setNewDriverName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${AGENTOS_BASE}/companies`, {
        headers: { "x-internal-key": AGENTOS_KEY },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCompanies(Array.isArray(data) ? data : (data.companies ?? []));
    } catch (err) {
      console.error("[TruckSetup] Failed to fetch companies:", err);
      Alert.alert("Error", "Failed to load companies. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchTrucks = async (company: Company) => {
    setSelectedCompany(company);
    setLoading(true);
    setStep(2);
    try {
      const res = await fetch(`${AGENTOS_BASE}/companies/${company.id}/trucks`, {
        headers: { "x-internal-key": AGENTOS_KEY },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTrucks(Array.isArray(data) ? data : (data.trucks ?? []));
    } catch (err) {
      console.error("[TruckSetup] Failed to fetch trucks:", err);
      Alert.alert("Error", "Failed to load trucks. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const selectTruck = (truck: Truck) => {
    setSelectedTruck(truck);
    setNewDriverName(truck.driverName);
    setStep(3);
  };

  const saveDriverNameToApi = async () => {
    if (!selectedTruck || !newDriverName.trim()) return;
    setSavingName(true);
    try {
      await fetch(`${AGENTOS_BASE}/trucks/${selectedTruck.id}/driver`, {
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
      Alert.alert("Error", "Failed to save driver name. Please try again.");
    } finally {
      setSavingName(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedTruck || !selectedCompany) return;
    setConfirming(true);

    const driverName = selectedTruck.driverName;
    const truckNumber = selectedTruck.truckNumber;
    const companyId = selectedCompany.id;
    const truckId = selectedTruck.id;

    try {
      // Save to AsyncStorage
      await setTruckId(truckId);
      await setTruckNumber(truckNumber);
      await setCompanyId(companyId);
      await setDriverName(driverName);
      await setTruckSetupComplete(true);

      // Register truck with PingPoint (non-blocking)
      fetch(`${PINGPOINT_BASE}/register-truck`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": PINGPOINT_KEY,
        },
        body: JSON.stringify({ truckNumber, companyId, driverName }),
      }).catch(() => {
        // Ignore errors - endpoint may not exist yet
      });

      // Switch navigation to main app
      await completeTruckSetup();
    } catch (err) {
      console.error("[TruckSetup] Failed to confirm setup:", err);
      Alert.alert("Error", "Failed to complete setup. Please try again.");
      setConfirming(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>PINGPOINT</ThemedText>
        <ThemedText style={styles.headerSubtitle}>TRUCK SETUP</ThemedText>
      </View>

      <View style={styles.stepIndicator}>
        {[1, 2, 3].map((s) => (
          <View
            key={s}
            style={[
              styles.stepDot,
              step >= s && styles.stepDotActive,
            ]}
          />
        ))}
      </View>

      {/* Step 1: Select Company */}
      {step === 1 && (
        <View style={styles.stepContainer}>
          <ThemedText style={styles.stepTitle}>SELECT COMPANY</ThemedText>
          <ThemedText style={styles.stepSubtitle}>Choose your trucking company</ThemedText>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={PingPointColors.cyan} />
              <ThemedText style={styles.loadingText}>Loading companies...</ThemedText>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {companies.map((company) => (
                <Pressable
                  key={company.id}
                  onPress={() => fetchTrucks(company)}
                  style={({ pressed }) => [
                    styles.listItem,
                    pressed && styles.listItemPressed,
                  ]}
                >
                  <ThemedText style={styles.listItemText}>{company.name}</ThemedText>
                  <ThemedText style={styles.listItemChevron}>›</ThemedText>
                </Pressable>
              ))}
              {companies.length === 0 && (
                <ThemedText style={styles.emptyText}>No companies found</ThemedText>
              )}
            </ScrollView>
          )}
        </View>
      )}

      {/* Step 2: Select Truck */}
      {step === 2 && (
        <View style={styles.stepContainer}>
          <Pressable onPress={() => setStep(1)} style={styles.backButton}>
            <ThemedText style={styles.backButtonText}>‹ {selectedCompany?.name}</ThemedText>
          </Pressable>
          <ThemedText style={styles.stepTitle}>SELECT TRUCK</ThemedText>
          <ThemedText style={styles.stepSubtitle}>Choose your truck</ThemedText>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={PingPointColors.cyan} />
              <ThemedText style={styles.loadingText}>Loading trucks...</ThemedText>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {trucks.map((truck) => (
                <Pressable
                  key={truck.id}
                  onPress={() => selectTruck(truck)}
                  style={({ pressed }) => [
                    styles.listItem,
                    pressed && styles.listItemPressed,
                  ]}
                >
                  <View style={styles.truckItemContent}>
                    <ThemedText style={styles.truckNumber}>Truck {truck.truckNumber}</ThemedText>
                    <ThemedText style={styles.truckDriver}>{truck.driverName}</ThemedText>
                  </View>
                  <ThemedText style={styles.listItemChevron}>›</ThemedText>
                </Pressable>
              ))}
              {trucks.length === 0 && (
                <ThemedText style={styles.emptyText}>No trucks found</ThemedText>
              )}
            </ScrollView>
          )}
        </View>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && selectedTruck && (
        <View style={styles.stepContainer}>
          <Pressable onPress={() => setStep(2)} style={styles.backButton}>
            <ThemedText style={styles.backButtonText}>‹ Back</ThemedText>
          </Pressable>
          <ThemedText style={styles.stepTitle}>CONFIRM TRUCK</ThemedText>

          <View style={[styles.confirmCard, Shadows.arcade?.cyan]}>
            <ThemedText style={styles.confirmTruckNumber}>
              TRUCK {selectedTruck.truckNumber}
            </ThemedText>
            <ThemedText style={styles.confirmCompany}>{selectedCompany?.name}</ThemedText>

            {editingName ? (
              <View style={styles.nameEditContainer}>
                <TextInput
                  style={styles.nameInput}
                  value={newDriverName}
                  onChangeText={setNewDriverName}
                  placeholder="Enter driver name"
                  placeholderTextColor={PingPointColors.textMuted}
                  autoFocus
                />
                <Pressable
                  onPress={saveDriverNameToApi}
                  disabled={savingName}
                  style={[styles.saveButton, savingName && styles.buttonDisabled]}
                >
                  {savingName ? (
                    <ActivityIndicator size="small" color={PingPointColors.background} />
                  ) : (
                    <ThemedText style={styles.saveButtonText}>SAVE</ThemedText>
                  )}
                </Pressable>
              </View>
            ) : (
              <ThemedText style={styles.confirmDriverName}>
                {selectedTruck.driverName}
              </ThemedText>
            )}
          </View>

          {!editingName && (
            <Pressable
              onPress={() => {
                setEditingName(true);
                setNewDriverName(selectedTruck.driverName);
              }}
              style={styles.editNameButton}
            >
              <ThemedText style={styles.editNameButtonText}>Edit Driver Name</ThemedText>
            </Pressable>
          )}

          <Pressable
            onPress={handleConfirm}
            disabled={confirming || editingName}
            style={[styles.confirmButton, (confirming || editingName) && styles.buttonDisabled]}
          >
            {confirming ? (
              <ActivityIndicator size="small" color={PingPointColors.background} />
            ) : (
              <ThemedText style={styles.confirmButtonText}>CONFIRM & START</ThemedText>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PingPointColors.background,
  },
  header: {
    paddingHorizontal: Spacing["2xl"],
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: PingPointColors.cyan,
    letterSpacing: 3,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: PingPointColors.textSecondary,
    letterSpacing: 4,
    marginTop: -2,
  },
  stepIndicator: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing["2xl"],
    paddingBottom: Spacing.xl,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PingPointColors.border,
  },
  stepDotActive: {
    backgroundColor: PingPointColors.cyan,
  },
  stepContainer: {
    flex: 1,
    paddingHorizontal: Spacing["2xl"],
  },
  stepTitle: {
    ...Typography.h3,
    color: PingPointColors.textPrimary,
    letterSpacing: 2,
    marginBottom: Spacing.xs,
  },
  stepSubtitle: {
    ...Typography.small,
    color: PingPointColors.textMuted,
    marginBottom: Spacing.xl,
  },
  backButton: {
    marginBottom: Spacing.md,
  },
  backButtonText: {
    ...Typography.body,
    color: PingPointColors.cyan,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  loadingText: {
    ...Typography.small,
    color: PingPointColors.textMuted,
  },
  list: {
    flex: 1,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PingPointColors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(0, 217, 255, 0.2)",
  },
  listItemPressed: {
    opacity: 0.75,
    backgroundColor: "rgba(0, 217, 255, 0.08)",
  },
  listItemText: {
    ...Typography.body,
    color: PingPointColors.textPrimary,
    flex: 1,
  },
  listItemChevron: {
    fontSize: 22,
    color: PingPointColors.cyan,
    lineHeight: 24,
  },
  truckItemContent: {
    flex: 1,
  },
  truckNumber: {
    ...Typography.body,
    color: PingPointColors.textPrimary,
    fontWeight: "600",
  },
  truckDriver: {
    ...Typography.small,
    color: PingPointColors.textSecondary,
    marginTop: 2,
  },
  emptyText: {
    ...Typography.body,
    color: PingPointColors.textMuted,
    textAlign: "center",
    marginTop: Spacing["3xl"],
  },
  confirmCard: {
    backgroundColor: PingPointColors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing["2xl"],
    borderWidth: 1,
    borderColor: PingPointColors.cyan,
    marginBottom: Spacing.xl,
    alignItems: "center",
  },
  confirmTruckNumber: {
    fontSize: 36,
    fontWeight: "700",
    color: PingPointColors.cyan,
    letterSpacing: 3,
    marginBottom: Spacing.sm,
  },
  confirmCompany: {
    ...Typography.body,
    color: PingPointColors.textSecondary,
    marginBottom: Spacing.lg,
  },
  confirmDriverName: {
    ...Typography.h4,
    color: PingPointColors.textPrimary,
    fontWeight: "600",
  },
  nameEditContainer: {
    width: "100%",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  nameInput: {
    backgroundColor: PingPointColors.surfaceLight,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: PingPointColors.cyan,
    padding: Spacing.md,
    color: PingPointColors.textPrimary,
    ...Typography.body,
    width: "100%",
  },
  saveButton: {
    backgroundColor: PingPointColors.cyan,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: "center",
  },
  saveButtonText: {
    ...Typography.button,
    color: PingPointColors.background,
    fontWeight: "700",
  },
  editNameButton: {
    borderWidth: 1,
    borderColor: PingPointColors.cyan,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  editNameButtonText: {
    ...Typography.button,
    color: PingPointColors.cyan,
  },
  confirmButton: {
    backgroundColor: PingPointColors.cyan,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    ...Typography.button,
    color: PingPointColors.background,
    fontWeight: "700",
    letterSpacing: 1,
  },
});
