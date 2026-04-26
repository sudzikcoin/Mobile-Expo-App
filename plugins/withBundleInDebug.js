// Forces React Native gradle plugin to bundle JS into the debug APK so
// preview-debug builds run standalone (no Metro server needed).
const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withBundleInDebug(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    if (/^\s*bundleInDebug\s*=\s*true/m.test(contents)) {
      return config;
    }

    if (!/react\s*\{/.test(contents)) {
      throw new Error(
        "withBundleInDebug: react { } block not found in app/build.gradle"
      );
    }

    config.modResults.contents = contents.replace(
      /react\s*\{/,
      "react {\n    bundleInDebug = true"
    );
    return config;
  });
};
