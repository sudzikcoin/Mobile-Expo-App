// Continuous Native Generation config. Native android/ios dirs are
// regenerated from this + plugins, so do not commit those.
module.exports = {
  expo: {
    name: "PingPoint Driver",
    slug: "pingpoint-driver",
    version: "1.9.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "pingpoint",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.pingpoint.driver",
      // PLACEHOLDER — structurally valid but fake. @react-native-firebase/app
      // refuses to prebuild the iOS project without one. Replace with the real
      // file from the Firebase console (add an iOS app to the pingpoint
      // project) before any push-notification work; APNs also needs the Push
      // Notifications capability + an APNs key uploaded to Firebase.
      googleServicesFile: "./GoogleService-Info.plist",
      associatedDomains: ["applinks:pingpoint.suverse.io"],
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "PingPoint Driver needs your location to track deliveries and share your position with dispatchers.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "PingPoint Driver needs background location access to continue tracking while you're driving.",
        NSBluetoothAlwaysUsageDescription:
          "PingPoint Driver connects to your truck's IOSiX ELD over Bluetooth to report engine telemetry.",
        NSBluetoothPeripheralUsageDescription:
          "PingPoint Driver connects to your truck's IOSiX ELD over Bluetooth to report engine telemetry.",
        // transistorsoft uses CMMotionActivityManager for motion detection;
        // without this key iOS kills the app the moment the SDK touches it.
        NSMotionUsageDescription:
          "PingPoint Driver uses motion activity to detect when your truck starts and stops moving, which saves battery during long stops.",
        // PingPoint NAV WebView: the Permit tab's TAKE PHOTO opens the
        // camera from the embedded page. Without this key iOS kills the app
        // when WKWebView requests capture.
        NSCameraUsageDescription:
          "PingPoint Driver uses the camera to photograph oversize-load permits in PingPoint NAV.",
        // location + bluetooth-central: GPS tracking and BLE ELD frames in
        // background. fetch/processing: TSBackgroundFetch (transistorsoft's
        // scheduler, pulled in via react-native-background-fetch) registers
        // BGTaskScheduler tasks; iOS 13+ requires the permitted-identifiers
        // list to name them or registration throws at launch.
        UIBackgroundModes: [
          "location",
          "bluetooth-central",
          "fetch",
          "processing",
        ],
        BGTaskSchedulerPermittedIdentifiers: ["com.transistorsoft.fetch"],
        // NAV WebView hands truckerpath:// etc. to the OS. openURL itself
        // doesn't need these, but anything that consults canOpenURL (incl.
        // react-native-webview's whitelist fallback) reports "cannot open"
        // for schemes not listed here.
        LSApplicationQueriesSchemes: [
          "truckerpath",
          "comgooglemaps",
          "googlemaps",
          "maps",
          "waze",
          "com.sygic.aura",
        ],
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      // Keep in lockstep with `version` (1.8.7 -> 187); EAS autoIncrement used
      // to own this remotely, but local prebuild emits versionCode 1 without it
      // and Android then refuses the install as a downgrade.
      versionCode: 190,
      adaptiveIcon: {
        backgroundColor: "#0a0a1f",
        foregroundImage: "./assets/images/android-icon-foreground.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.pingpoint.driver",
      googleServicesFile: "./google-services.json",
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "RECEIVE_BOOT_COMPLETED",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION",
        "FOREGROUND_SERVICE_CONNECTED_DEVICE",
        "POST_NOTIFICATIONS",
        "WAKE_LOCK",
        "BLUETOOTH",
        "BLUETOOTH_ADMIN",
        "BLUETOOTH_CONNECT",
        "BLUETOOTH_SCAN",
        "android.permission.BLUETOOTH",
        "android.permission.BLUETOOTH_ADMIN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.BLUETOOTH_SCAN",
        // PingPoint NAV WebView camera capture (Permit tab TAKE PHOTO):
        // WebChromeClient can only grant what the app itself holds.
        "CAMERA",
      ],
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: "pingpoint.suverse.io",
              pathPrefix: "/driver",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
        {
          action: "VIEW",
          data: [
            {
              scheme: "pingpoint",
              pathPrefix: "/driver",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    web: {
      output: "single",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      [
        // Firebase's Swift pods (FirebaseCoreInternal -> GoogleUtilities)
        // can't build as plain static libraries; react-native-firebase's
        // documented Expo fix is static frameworks. iOS-only setting —
        // Android is unaffected.
        "expo-build-properties",
        {
          ios: {
            useFrameworks: "static",
            // RNFB pods include non-modular React-Core headers, fatal when
            // they build as framework modules — link them as static libs.
            forceStaticLinking: ["RNFBApp", "RNFBMessaging"],
          },
        },
      ],
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#0a0a1f",
          dark: { backgroundColor: "#0a0a1f" },
        },
      ],
      "expo-web-browser",
      "expo-localization",
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Allow PingPoint to use your location for GPS tracking.",
          locationAlwaysPermission:
            "Allow PingPoint to use your location in the background.",
          locationWhenInUsePermission:
            "Allow PingPoint to use your location while the app is active.",
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
      "./plugins/withMonitoringTool",
      "expo-task-manager",
      "expo-notifications",
      "./plugins/withBootReceiver",
      "./plugins/withBundleInDebug",
      "./plugins/withStableDebugKeystore",
      "./plugins/withNotificationIcon",
      [
        "react-native-ble-plx",
        {
          isBackgroundEnabled: true,
          modes: ["central"],
          bluetoothAlwaysPermission:
            "PingPoint Driver connects to your truck's IOSiX ELD over Bluetooth to report engine telemetry.",
        },
      ],
      "@react-native-firebase/app",
      [
        "react-native-background-geolocation",
        {
          // Empty in debug; Block 9 plants the production key from env.
          license: process.env.TRANSISTORSOFT_LICENSE || "",
        },
      ],
      "react-native-background-fetch",
      [
        "expo-build-properties",
        {
          android: { extraMavenRepos: [] },
        },
      ],
    ],
    experiments: {
      reactCompiler: true,
    },
    extra: {
      eas: {
        projectId: "a8c47007-d73f-4e8a-8cc1-f496de55fc29",
      },
    },
    owner: "sudzik",
  },
};
