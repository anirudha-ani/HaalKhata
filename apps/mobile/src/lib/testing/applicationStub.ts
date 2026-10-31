/** Stand-in for expo-application: a native module, with nothing to load under Vitest. */

/** @returns A fixed install date. */
export async function getInstallationTimeAsync(): Promise<Date> {
  return new Date(0);
}
