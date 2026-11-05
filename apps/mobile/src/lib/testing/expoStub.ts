/** Stand-in for the `expo` package's native-module loader: no native module exists under Vitest. */

/** @returns Nothing, as for a module missing from the build. */
export function requireOptionalNativeModule(): null {
  return null;
}
