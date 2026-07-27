import React, { useCallback } from "react";
import { View, StyleSheet, ActivityIndicator, Linking } from "react-native";
import { WebViewNavigation } from "react-native-webview";

import ResilientWebView from "@/components/ResilientWebView";
import ScreenHeader from "@/components/ScreenHeader";
import { PingPointColors } from "@/constants/theme";
import { useAppTheme } from "@/lib/theme-context";

const NAV_URL = "https://pingpoint.suverse.io/nav/";

// Schemes the page itself needs (blob: previews, about:blank from
// window.open, data: images). Everything else non-http(s) — truckerpath://,
// comgooglemaps://, googlemaps://, maps://, waze://, com.sygic.aura://,
// tel:, mailto:, geo:, intent:// — goes to the OS.
const IN_PAGE_SCHEMES = /^(https?|about|blob|data|javascript|file):/i;

// http(s) links that must open in the native maps apps, not inside the
// WebView: NAV's Google Maps export uses https://www.google.com/maps/dir/,
// Apple Maps uses https://maps.apple.com/, Waze uses https://waze.com/ul.
const EXTERNAL_HTTP_HOSTS = [
  /^https?:\/\/(www\.)?google\.[a-z.]+\/maps/i,
  /^https?:\/\/maps\.google\.[a-z.]+/i,
  /^https?:\/\/(www\.)?maps\.apple\.com/i,
  /^https?:\/\/(www\.)?waze\.com\/ul/i,
];

export function isExternalUrl(url: string): boolean {
  if (!IN_PAGE_SCHEMES.test(url)) return true;
  return EXTERNAL_HTTP_HOSTS.some((re) => re.test(url));
}

export default function NavScreen() {
  const { colors } = useAppTheme();

  const handleShouldStartLoad = useCallback((request: WebViewNavigation) => {
    if (!isExternalUrl(request.url)) return true;
    // Hand off to the OS (Trucker Path / Google Maps / Waze / Sygic / dialer).
    // Failure just means the target app isn't installed — swallow it, the
    // NAV page shows its own fallback links.
    Linking.openURL(request.url).catch(() => {});
    return false;
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="PingPoint NAV" />
      {/* ResilientWebView: same iOS blank-after-detach recovery as Status.
          The probe only reloads a DEAD page, so NAV's in-page state (parsed
          RC, built route) survives normal away-and-back navigation. */}
      <ResilientWebView
        source={{ uri: NAV_URL }}
        style={styles.webview}
        // Without "*", react-native-webview's JS-side whitelist (default
        // http/https only) swallows every custom-scheme tap BEFORE
        // onShouldStartLoadWithRequest runs: it gates on Linking.canOpenURL,
        // which iOS fails for schemes missing from LSApplicationQueriesSchemes
        // and Android 11+ fails for packages missing from <queries> — the
        // Trucker Path button read as a dead tap. "*" routes every URL through
        // our handler, which calls openURL directly (no canOpenURL gate).
        originWhitelist={["*"]}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        // window.open() must navigate the same WebView so the URL passes
        // through onShouldStartLoadWithRequest instead of being swallowed.
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically
        // Camera for the Permit tab's TAKE PHOTO: iOS grants WKWebView
        // capture without a second in-page prompt; Android's WebChromeClient
        // grant is handled natively by react-native-webview (needs the
        // CAMERA permission declared in app.config.js).
        mediaCapturePermissionGrantType="grant"
        allowsInlineMediaPlayback
        // Android file upload (<input type="file">) uses the built-in
        // onShowFileChooser; file access keeps content:// results readable.
        allowFileAccess
        domStorageEnabled
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
