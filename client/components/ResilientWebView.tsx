import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { AppState } from "react-native";
import { WebView, WebViewMessageEvent, WebViewProps } from "react-native-webview";
import { useFocusEffect } from "@react-navigation/native";

// WebView that survives iOS suspending/killing its web content process.
//
// All three WebView screens (Status, NAV, Legal) stay mounted while the
// driver is elsewhere in the app (drawer keeps screens alive, freeze is off
// so Android doesn't come back to a black surface). On iOS that leaves the
// WKWebView unparented, and WebKit first suspends the page's timers, then —
// after long enough, or under memory pressure — terminates the web content
// process outright. A terminated process is unrecoverable from inside the
// page: the surface renders blank and no JS runs, so the screen looks dead
// until a full app restart. Android's WebView keeps detached pages running,
// which is why the same build is fine there.
//
// Recovery has two layers:
//  1. onContentProcessDidTerminate / onRenderProcessGone — the OS told us
//     the process died; reload immediately.
//  2. A liveness probe on every screen focus and app-foreground while
//     focused: inject a ping into the page; a live (or merely suspended)
//     process answers within PROBE_TIMEOUT_MS and the injection itself
//     resumes it. No answer means the process is gone without the event
//     having fired (it does not fire for unparented views) — reload.
// The probe also calls window.__pp_tick when the page defines it (the
// telemetry page does), so a resumed page refetches instantly instead of
// waiting out its poll interval.
const PROBE_SENTINEL = "pp-webview-alive";
const PROBE_JS = `(function(){try{if(window.__pp_tick)window.__pp_tick();if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(${JSON.stringify(
  PROBE_SENTINEL,
)});}catch(e){}})();true;`;
const PROBE_TIMEOUT_MS = 1500;

const ResilientWebView = forwardRef<WebView, WebViewProps>(function ResilientWebView(
  { onMessage, onLoadEnd, ...props },
  outerRef,
) {
  const webRef = useRef<WebView>(null);
  useImperativeHandle(outerRef, () => webRef.current as WebView);

  // No probing until the page has completed at least one load — a probe
  // racing the initial load would time out and trigger a pointless reload.
  const loadedRef = useRef(false);
  const aliveRef = useRef(false);
  const probeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearProbe = useCallback(() => {
    if (probeTimer.current) {
      clearTimeout(probeTimer.current);
      probeTimer.current = null;
    }
  }, []);

  const probe = useCallback(() => {
    if (!loadedRef.current || !webRef.current) return;
    clearProbe();
    aliveRef.current = false;
    webRef.current.injectJavaScript(PROBE_JS);
    probeTimer.current = setTimeout(() => {
      probeTimer.current = null;
      if (!aliveRef.current && webRef.current) {
        loadedRef.current = false;
        webRef.current.reload();
      }
    }, PROBE_TIMEOUT_MS);
  }, [clearProbe]);

  useFocusEffect(
    useCallback(() => {
      probe();
      // Backgrounding the app while sitting ON this screen suspends the
      // process too, and no focus event fires on the way back — probe on
      // foreground as well, but only while this screen is the focused one.
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") probe();
      });
      return () => {
        sub.remove();
        clearProbe();
      };
    }, [probe, clearProbe]),
  );

  useEffect(() => clearProbe, [clearProbe]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      if (event.nativeEvent.data === PROBE_SENTINEL) {
        aliveRef.current = true;
        return;
      }
      onMessage?.(event);
    },
    [onMessage],
  );

  return (
    <WebView
      ref={webRef}
      {...props}
      onMessage={handleMessage}
      onLoadEnd={(event) => {
        loadedRef.current = true;
        onLoadEnd?.(event);
      }}
      // iOS: WKWebView web content process died while attached or while the
      // app was suspended — the view is blank and nothing inside it will
      // ever run again. Reload is the only recovery.
      onContentProcessDidTerminate={() => {
        loadedRef.current = false;
        webRef.current?.reload();
      }}
      // Android counterpart (renderer OOM-killed); rare, same recovery.
      onRenderProcessGone={() => {
        loadedRef.current = false;
        webRef.current?.reload();
      }}
    />
  );
});

export default ResilientWebView;
