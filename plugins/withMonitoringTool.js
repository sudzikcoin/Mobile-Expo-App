const { withAndroidManifest } = require("expo/config-plugins");

module.exports = function withMonitoringTool(config) {
  return withAndroidManifest(config, async (config) => {
    const mainApplication =
      config.modResults.manifest.application?.[0];

    if (!mainApplication) {
      return config;
    }

    if (!mainApplication["meta-data"]) {
      mainApplication["meta-data"] = [];
    }

    const existing = mainApplication["meta-data"].find(
      (item) =>
        item.$?.["android:name"] === "com.google.android.apps.work.monitoring"
    );

    if (!existing) {
      mainApplication["meta-data"].push({
        $: {
          "android:name": "com.google.android.apps.work.monitoring",
          "android:value": "true",
        },
      });
    }

    return config;
  });
};
