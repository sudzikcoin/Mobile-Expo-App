import React, { useCallback, useState } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import ResilientWebView from "@/components/ResilientWebView";
import ScreenHeader from "@/components/ScreenHeader";
import { PingPointColors } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n";
import { getActiveToken } from "@/lib/storage";

// IFTA = the quarterly fuel-tax calculator, served by the PingPoint server
// and scoped to this driver via the binding token. Same WebView shell
// pattern as Status/NAV: the page owns the whole flow (reports list →
// upload → column mapping → review → result → export).
const IFTA_BASE = "https://pingpoint.suverse.io/ifta";

export default function IftaScreen() {
  const { colors } = useAppTheme();
  const { t, lang } = useI18n();
  const [url, setUrl] = useState<string | null>(null);

  // Rebuilt on every focus (drawer keeps the screen mounted): a mount-time
  // effect would pin a blank/stale token forever. Same string = WebView no-op.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getActiveToken().then((token) => {
        if (cancelled) return;
        const params = new URLSearchParams({ token: token ?? "", lang });
        setUrl(`${IFTA_BASE}?${params.toString()}`);
      });
      return () => {
        cancelled = true;
      };
    }, [lang])
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t("ifta.title")} />
      {url ? (
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
