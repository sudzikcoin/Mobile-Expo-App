const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withBootReceiver(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];

    if (!app.receiver) app.receiver = [];

    const hasReceiver = app.receiver.some(
      (r) => r.$?.['android:name'] === 'expo.modules.taskmanager.TaskBroadcastReceiver'
    );

    if (!hasReceiver) {
      app.receiver.push({
        $: {
          'android:name': 'expo.modules.taskmanager.TaskBroadcastReceiver',
          'android:exported': 'false',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } }],
          },
        ],
      });
    }

    return config;
  });
};
