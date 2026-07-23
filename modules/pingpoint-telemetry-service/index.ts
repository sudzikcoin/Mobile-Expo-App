import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

// Android-only local module (see android/). On iOS the bluetooth-central
// UIBackgroundMode already keeps BLE delivery alive, and in Expo Go the
// native module simply isn't present — both resolve to no-ops here.
interface PPTelemetryServiceNativeModule {
  start(title: string, text: string): boolean;
  stop(): boolean;
  addListener(
    eventName: "onPPTick",
    listener: () => void,
  ): { remove: () => void };
}

const native =
  Platform.OS === "android"
    ? requireOptionalNativeModule<PPTelemetryServiceNativeModule>("PPTelemetryService")
    : null;

export function startTelemetryForegroundService(
  title: string,
  text: string,
): boolean {
  if (!native) return false;
  try {
    return native.start(title, text) === true;
  } catch {
    return false;
  }
}

export function stopTelemetryForegroundService(): void {
  if (!native) return;
  try {
    native.stop();
  } catch {}
}

export function addTelemetryTickListener(
  listener: () => void,
): { remove: () => void } | null {
  if (!native) return null;
  try {
    return native.addListener("onPPTick", listener);
  } catch {
    return null;
  }
}
