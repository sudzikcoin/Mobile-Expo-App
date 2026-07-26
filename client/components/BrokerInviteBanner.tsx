import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, Pressable, AppState } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { PingPointColors, Spacing, Typography } from "@/constants/theme";
import { useDriver } from "@/lib/driver-context";
import { isTruckToken } from "@/lib/storage";
import {
  BrokerInvitation,
  fetchBrokerInvitations,
  respondBrokerInvitation,
} from "@/lib/api";

// Pending broker invitations for a bound driver. A new broker who types this
// driver's phone can't see anything until the driver taps Accept here — the
// binding then extends to that broker and their loads start flowing in.
export default function BrokerInviteBanner() {
  const { token, refreshLoad } = useDriver();
  const [invitations, setInvitations] = useState<BrokerInvitation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !isTruckToken(token)) return;
    const rows = await fetchBrokerInvitations(token);
    setInvitations(rows);
  }, [token]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 60000);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [refresh]);

  const respond = async (inv: BrokerInvitation, action: "accept" | "decline") => {
    if (!token || busyId) return;
    setBusyId(inv.id);
    try {
      const ok = await respondBrokerInvitation(token, inv.id, action);
      if (ok) {
        setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
        if (action === "accept") {
          // The accepted broker's load may now be the active one.
          void refreshLoad();
        }
      }
    } finally {
      setBusyId(null);
    }
  };

  if (invitations.length === 0) return null;

  return (
    <View>
      {invitations.map((inv) => (
        <View key={inv.id} style={styles.card}>
          <View style={styles.headerRow}>
            <Feather name="user-plus" size={18} color={PingPointColors.cyan} />
            <ThemedText style={styles.title}>{inv.brokerName}</ThemedText>
          </View>
          <ThemedText style={styles.body}>
            {inv.loadNumber
              ? `Invites you to track load ${inv.loadNumber}. Accept to start receiving their loads.`
              : "Invites you to receive their loads in this app."}
          </ThemedText>
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.button, styles.acceptButton]}
              disabled={busyId === inv.id}
              onPress={() => void respond(inv, "accept")}
            >
              <ThemedText style={styles.acceptText}>Accept</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.button, styles.declineButton]}
              disabled={busyId === inv.id}
              onPress={() => void respond(inv, "decline")}
            >
              <ThemedText style={styles.declineText}>Decline</ThemedText>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: PingPointColors.cyan,
    backgroundColor: "rgba(0, 217, 255, 0.08)",
    borderRadius: 12,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.h4,
    color: PingPointColors.textPrimary,
  },
  body: {
    ...Typography.body,
    color: PingPointColors.textSecondary,
    marginBottom: Spacing.lg,
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  button: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  acceptButton: {
    backgroundColor: PingPointColors.cyan,
  },
  acceptText: {
    ...Typography.h4,
    color: "#00131a",
  },
  declineButton: {
    borderWidth: 1,
    borderColor: PingPointColors.textMuted,
  },
  declineText: {
    ...Typography.h4,
    color: PingPointColors.textSecondary,
  },
});
