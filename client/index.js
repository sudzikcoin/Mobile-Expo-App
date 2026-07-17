import { registerRootComponent } from "expo";
import messaging from "@react-native-firebase/messaging";
import BackgroundGeolocation from "react-native-background-geolocation";

import App from "@/App";
import { handleFcmDataMessage } from "@/lib/fcm";

// Background message handler MUST be registered at module load time —
// before the React tree mounts — so the headless JS instance Android
// spawns for a data-only push can find it. Foreground handler lives
// inside DriverContext (where it has access to driver state).
messaging().setBackgroundMessageHandler(async (message) => {
  console.log("[FCM][bg] message received");
  await handleFcmDataMessage(message, "fcm_bg");
});

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
