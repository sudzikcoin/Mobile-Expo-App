const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Copies assets/ic_notification.xml into android/app/src/main/res/drawable
// at prebuild time so transistorsoft's notification.smallIcon =
// "drawable/ic_notification" resolves to a real resource. CNG regenerates
// android/ on every build, so this must run as a config plugin.
module.exports = function withNotificationIcon(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const src = path.join(projectRoot, "assets", "ic_notification.xml");
      const drawableDir = path.join(
        platformRoot,
        "app",
        "src",
        "main",
        "res",
        "drawable",
      );
      const dst = path.join(drawableDir, "ic_notification.xml");

      if (!fs.existsSync(src)) {
        throw new Error(
          `withNotificationIcon: source file missing at ${src}`,
        );
      }
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.copyFileSync(src, dst);
      return cfg;
    },
  ]);
};
