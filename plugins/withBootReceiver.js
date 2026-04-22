const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withBootReceiver(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application?.[0];

    if (!mainApplication) return config;

    if (!mainApplication.receiver) {
      mainApplication.receiver = [];
    }

    const bootReceiverExists = mainApplication.receiver.some(
      (r) =>
        r.$?.["android:name"]?.includes("BootReceiver") ||
        r.$?.["android:name"]?.includes("RNBootPermission")
    );

    if (!bootReceiverExists) {
      mainApplication.receiver.push({
        $: {
          "android:name": "expo.modules.taskmanager.TaskManagerPackage$BootReceiver",
          "android:enabled": "true",
          "android:exported": "true",
        },
        "intent-filter": [
          {
            action: [
              {
                $: {
                  "android:name": "android.intent.action.BOOT_COMPLETED",
                },
              },
            ],
          },
        ],
      });
    }

    return config;
  });
};
