/** Regression coverage for release bundles that otherwise fail only after installation. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateReleaseEnvironment } = require('./release.cjs');

const validEnvironment = {
  EAS_BUILD_PROFILE: 'production',
  EAS_BUILD_PLATFORM: 'ios',
  EXPO_PUBLIC_API_URL: 'https://haalkhata.app',
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: 'example.apps.googleusercontent.com',
};

test('development does not require production credentials', () => {
  assert.doesNotThrow(() => validateReleaseEnvironment({ EAS_BUILD_PROFILE: 'development' }));
});
test('release accepts an HTTPS API and a platform Google client', () => {
  assert.doesNotThrow(() => validateReleaseEnvironment(validEnvironment));
});
test('release refuses missing, plaintext, credential-bearing and path-bearing API URLs', () => {
  for (const origin of [undefined, 'http://haalkhata.app', 'https://user:secret@haalkhata.app',
    'https://haalkhata.app/api', 'https://haalkhata.app?token=secret', 'https://haalkhata.app#fragment']) {
    assert.throws(() => validateReleaseEnvironment({ ...validEnvironment, EXPO_PUBLIC_API_URL: origin }));
  }
});
test('preview and Android builds require their own native login configuration', () => {
  assert.throws(() => validateReleaseEnvironment({ ...validEnvironment, EAS_BUILD_PROFILE: 'preview',
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: '' }));
  assert.throws(() => validateReleaseEnvironment({ ...validEnvironment, EAS_BUILD_PLATFORM: 'android' }));
  assert.doesNotThrow(() => validateReleaseEnvironment({ ...validEnvironment, EAS_BUILD_PLATFORM: 'android',
    EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: 'android.apps.googleusercontent.com' }));
});
