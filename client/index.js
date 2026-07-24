import { registerRootComponent } from "expo";
import messaging from "@react-native-firebase/messaging";
import BackgroundGeolocation from "react-native-background-geolocation";

import App from "@/App";
import { handleFcmDataMessage, FCM_SUPPORTED } from "@/lib/fcm";
import { notifyStopEvent } from "@/lib/notifications";

// Background message handler MUST be registered at module load time —
// before the React tree mounts — so the headless JS instance Android
// spawns for a data-only push can find it. Foreground handler lives
// inside DriverContext (where it has access to driver state).
// iOS: skipped — messaging() throws at startup while GoogleService-Info.plist
// is a placeholder (see FCM_SUPPORTED). There is no Android-style headless JS
// on iOS anyway; background pushes re-launch the full app via
// `content-available` and land in the same handler set once FCM is enabled.
if (FCM_SUPPORTED) {
  messaging().setBackgroundMessageHandler(async (message) => {
    console.log("[FCM][bg] message received");
    await handleFcmDataMessage(message, "fcm_bg");
  });
}

// Headless task — runs when Android has terminated the app but the SDK keeps
// tracking (stopOnTerminate:false, enableHeadless:true). The config enabled
// headless mode but never registered a task, so native geofence crossings and
// heartbeats fired with no JS to flush the queue. Force a fresh fix + sync so
// the server-side geofence engine sees the arrival promptly instead of waiting
// for the next Doze flush. Must be registered at module load, before React
// mounts, so the terminated-state headless JS instance can find it.
const backgroundGeolocationHeadlessTask = async (event) => {
  try {
    if (event.name === "geofence" || event.name === "heartbeat") {
      // In terminated state there's no React tree to surface the crossing —
      // the local notification is the only feedback the driver gets. Stop
      // details aren't available here, so the text stays generic; the server
      // marks the actual arrive/depart from the synced ping stream.
      if (event.name === "geofence") {
        const action = event.params?.action;
        if (action === "ENTER" || action === "EXIT") {
          void notifyStopEvent(action, null);
        }
      }
      await BackgroundGeolocation.getCurrentPosition({
        samples: 1,
        persist: true,
        timeout: 30,
        maximumAge: 5000,
      });
      await BackgroundGeolocation.sync();
    }
  } catch (err) {
    console.warn("[Headless] task failed:", err);
  }
};
BackgroundGeolocation.registerHeadlessTask(backgroundGeolocationHeadlessTask);

registerRootComponent(App);
