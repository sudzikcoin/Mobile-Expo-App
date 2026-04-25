import { registerRootComponent } from "expo";
import messaging from "@react-native-firebase/messaging";

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

registerRootComponent(App);
