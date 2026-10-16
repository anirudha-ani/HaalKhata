/** Constants for push notifications on the phone: storage keys, timing and retries. */

/** SecureStore key for this installation's id, minted once and kept across launches. */
export const INSTALLATION_ID_STORAGE_KEY = "haalkhata-push-installation";

/** SecureStore key for the device id the server returned for this phone. */
export const DEVICE_ID_STORAGE_KEY = "haalkhata-push-device";

/** SecureStore key recording that the first-use explainer was shown on this phone. */
export const EXPLAINER_SHOWN_STORAGE_KEY = "haalkhata-push-explainer-shown";

/** A registered phone refreshes its registration at most this often while it is used. */
export const REGISTRATION_REFRESH_MS = 24 * 60 * 60 * 1_000;

/** Waits between attempts to get the Expo token, which needs Expo's servers. */
export const TOKEN_RETRY_DELAYS_MS = [2_000, 8_000] as const;

/** Sign-out waits at most this long for the server to forget this phone. */
export const REMOVE_DEVICE_TIMEOUT_MS = 2_000;
