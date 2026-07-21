import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Geofence ENTER/EXIT already fires reliably from the background (native SDK +
// server-side evaluation), but the driver had no way to SEE it without opening
// the app — LD-2026-004259: arrival was detected within 1s of crossing the
// zone and the driver stood at the dock thinking detection had failed. These
// local notifications are that missing feedback channel.

const CHANNEL_ID = "pingpoint_stop_events";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let channelReady = false;
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android" || channelReady) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Stop arrivals & departures",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
  });
  channelReady = true;
}

export async function notifyStopEvent(
  action: "ENTER" | "EXIT",
  stopName?: string | null,
): Promise<void> {
  try {
    await ensureChannel();
    const title = action === "ENTER" ? "Arrived at stop" : "Departed stop";
    const body = stopName
      ? action === "ENTER"
        ? `Arrival at ${stopName} recorded — dispatch has been notified.`
        : `Departure from ${stopName} recorded — dispatch has been notified.`
      : action === "ENTER"
        ? "Stop arrival recorded — dispatch has been notified."
        : "Stop departure recorded — dispatch has been notified.";
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: "default" },
      trigger: Platform.OS === "android" ? { channelId: CHANNEL_ID } : null,
    });
  } catch (err) {
    // Notification is feedback, not function — never let it break the
    // arrive/depart flow it decorates.
    console.warn("[Notify] stop event notification failed:", err);
  }
}
