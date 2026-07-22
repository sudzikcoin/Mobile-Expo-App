// Debug builds must keep a stable signing identity across `expo prebuild
// --clean`, which deletes android/ — including android/app/debug.keystore —
// and regenerates it from the template. If that template ever changes (or a
// keystore is generated instead of copied), every truck would hit a signature
// mismatch on install and need a manual uninstall. The canonical keystore is
// committed at credentials/debug.keystore; this plugin points the debug
// signingConfig at it, so the generated android/app/debug.keystore is unused.
const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withStableDebugKeystore(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (contents.includes("credentials/debug.keystore")) {
      return config;
    }
    const patched = contents.replace(
      /storeFile file\('debug\.keystore'\)/,
      "storeFile file('../../credentials/debug.keystore')",
    );
    if (patched === contents) {
      throw new Error(
        "withStableDebugKeystore: debug signingConfig storeFile not found in app/build.gradle",
      );
    }
    config.modResults.contents = patched;
    return config;
  });
};
