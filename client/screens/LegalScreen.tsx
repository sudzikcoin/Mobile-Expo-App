import React from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { useRoute, RouteProp } from "@react-navigation/native";

import ScreenHeader from "@/components/ScreenHeader";
import { PingPointColors } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";
import type { DrawerParamList } from "@/navigation/DrawerNavigator";

// In-app viewer for the static legal pages (Privacy Policy / Terms of
// Service) served at pingpoint.suverse.io/legal/*. Same WebView shell as
// NAV/Status; pages are self-contained, no scheme handoff needed.
type LegalRouteProp = RouteProp<DrawerParamList, "Legal">;

export default function LegalScreen() {
  const route = useRoute<LegalRouteProp>();
  const { colors } = useAppTheme();
  const { url, title } = route.params ?? {
    url: "https://pingpoint.suverse.io/legal/privacy",
    title: "Privacy Policy",
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title={title} />
      <WebView
        source={{ uri: url }}
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={PingPointColors.cyan} />
          </View>
        )}
      />
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
