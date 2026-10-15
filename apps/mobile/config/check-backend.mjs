/** EAS worker preflight: fail before compiling a bundle against an unprepared backend. */

if (['production', 'preview'].includes(process.env.EAS_BUILD_PROFILE)) {
  const origin = process.env.EXPO_PUBLIC_API_URL;
  const response = await fetch(new URL('/api/mobile-release', origin), { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('The mobile backend is not ready. Deploy and configure the release server first.');
  const information = await response.json();
  if (information.protocolVersion !== 1 || information.bundleIdentifier !== 'com.haalkhata.app' || !information.appleSignIn) {
    throw new Error('The deployed server does not support this mobile release.');
  }
  const clientId = process.env.EAS_BUILD_PLATFORM === 'android'
    ? process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID : process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!information.googleMobileClientIds?.includes(clientId)) {
    throw new Error('GOOGLE_MOBILE_CLIENT_IDS on the server must include this build’s native Google client ID.');
  }
  console.log('Mobile release backend and native login audiences verified.');
}
