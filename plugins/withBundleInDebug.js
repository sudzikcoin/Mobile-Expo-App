// Forces React Native gradle plugin to bundle JS into the debug APK so
// preview-debug builds run standalone (no Metro server needed).
//
// In RN 0.71+, the `react { }` extension uses `debuggableVariants` to decide
// which Android variants skip JS bundling (Metro is expected for those).
// Setting it to an empty list makes RN bundle JS for ALL variants. The
// debug variant still carries android:debuggable=true (set by AGP, not by
// React's plugin), so transistorsoft license check still skips.
const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withBundleInDebug(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    if (/debuggableVariants\s*=\s*\[\s*\]/.test(contents)) {
      return config;
    }

    if (!/react\s*\{/.test(contents)) {
      throw new Error(
        "withBundleInDebug: react { } block not found in app/build.gradle"
      );
    }

    config.modResults.contents = contents.replace(
      /react\s*\{/,
      "react {\n    debuggableVariants = []"
    );
    return config;
  });
};
