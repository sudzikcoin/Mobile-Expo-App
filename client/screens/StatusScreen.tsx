import React, { useCallback, useState } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import ResilientWebView from "@/components/ResilientWebView";
import ScreenHeader from "@/components/ScreenHeader";
import { PingPointColors } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n";
import { useUnits } from "@/lib/units-context";
import { getActiveToken } from "@/lib/storage";

// Status = the driver-facing telemetry inspector, served by the PingPoint
// server and scoped to THIS truck's stream via the binding token. Same
// WebView shell pattern as PingPoint NAV, minus the external-scheme handoff
// (the page has no outbound links). Poll cadence lives in the page (6s).
const STATUS_BASE = "https://pingpoint.suverse.io/telemetry";

export default function StatusScreen() {
  const { colors } = useAppTheme();
  const { t, lang } = useI18n();
  const { units } = useUnits();
  const [url, setUrl] = useState<string | null>(null);

  // Rebuilt on every focus, not once on mount: the drawer keeps this screen
  // mounted, so a mount-time effect would pin the first token forever (blank
  // token if binding wasn't ready yet, stale token after a re-bind). Setting
  // the same string again is a no-op for the WebView, so a plain reopen
  // doesn't reload the page.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getActiveToken().then((token) => {
        if (cancelled) return;
        const params = new URLSearchParams({
          token: token ?? "",
          units,
          lang,
        });
        setUrl(`${STATUS_BASE}?${params.toString()}`);
      });
      return () => {
        cancelled = true;
      };
    }, [units, lang])
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t("status.title")} />
      {url ? (
        // ResilientWebView, not a bare WebView: iOS kills the page's web
        // content process while this kept-mounted screen sits detached
        // behind another one, which used to come back as a dead blank
        // surface (poll loop stopped, restart required). The wrapper
        // probes on focus and reloads if the page is gone.
        <ResilientWebView
          source={{ uri: url }}
          style={styles.webview}
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={PingPointColors.cyan} />
            </View>
          )}
        />
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={PingPointColors.cyan} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: PingPointColors.background,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PingPointColors.background,
  },
});
