/** Constants for the first-run flow's per-phone bookkeeping. */

/**
 * AsyncStorage key set when someone signs in on this phone: the phone still
 * owes them the device steps (find friends, notifications, a verified
 * number). A session that predates this release never had it set, so an
 * update alone never interrupts anyone.
 */
export const SETUP_DUE_STORAGE_KEY = "haalkhata.setupDue";

/** Prefix of the AsyncStorage key recording that one account finished the device steps on this phone. */
export const SETUP_DONE_STORAGE_PREFIX = "haalkhata.setupDone.";

/** Query key for whether this phone owes the signed-in person the device steps; local, never sent. */
export const DEVICE_SETUP_QUERY_KEY = ["device", "setupOwed"] as const;

/** Query key for the plan of one visit to the first-run flow; local, never sent. */
export const ONBOARDING_PLAN_QUERY_KEY = ["device", "onboardingPlan"] as const;
