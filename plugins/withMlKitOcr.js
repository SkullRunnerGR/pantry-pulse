const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Configures Google ML Kit Play Services to auto-download BOTH the on-device Latin OCR
 * model and expo-camera's barcode_ui model at install time without Manifest Merger conflicts.
 */
module.exports = function withMlKitOcr(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const app = manifest.application?.[0];
    if (!app) return cfg;

    app['meta-data'] = app['meta-data'] || [];
    const existing = app['meta-data'].find(
      (item) => item.$?.['android:name'] === 'com.google.mlkit.vision.DEPENDENCIES'
    );

    if (existing) {
      const currentVals = String(existing.$['android:value'] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const req of ['ocr', 'barcode_ui']) {
        if (!currentVals.includes(req)) currentVals.push(req);
      }
      existing.$['android:value'] = currentVals.join(',');
      existing.$['tools:replace'] = 'android:value';
    } else {
      app['meta-data'].push({
        $: {
          'android:name': 'com.google.mlkit.vision.DEPENDENCIES',
          'android:value': 'ocr,barcode_ui',
          'tools:replace': 'android:value',
        },
      });
    }
    return cfg;
  });
};
