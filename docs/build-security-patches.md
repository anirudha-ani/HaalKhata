<!-- Security handling for build-tool dependencies (Expo/Metro), reviewed 2026-10-27. -->

# Build dependency security patches

Run `pnpm audit:production`. The gate runs the regression fixtures in
`scripts/security-patches.test.cjs`, verifies the SHA-256 of every local patch
recorded in `scripts/security-mitigations.json`, then queries the production
dependency audit. Every other high or critical advisory fails. A registry
error also fails.

There are **no local patches today**: `security-mitigations.json` is empty and
there is no `patchedDependencies` entry or `patches/` folder. The two
advisories that once needed one are resolved upstream:

| Package and advisory | Resolution | Verification |
| --- | --- | --- |
| `node-forge`, [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | Fixed upstream in **1.4.1** ("Require canonical DigestInfo in RSA PKCS#1 v1.5 verify"). An exact override in `pnpm-workspace.yaml` moves `@expo/cli`'s copy there; the version was taken on its release day, so it is listed in `minimumReleaseAgeExclude` (its `lib/` matched the v1.4.1 tag byte for byte, with no install scripts and no dependencies). | The fixtures load node-forge the way Expo CLI does and require 1.4.1 or later: valid SHA-256 signatures pass, and three forged DigestInfo encodings are rejected with an exponent-3 key. Plain 1.4.0 accepts all three. |
| `braces@3.0.3`, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | **Withdrawn** on 2026-10-23 as not practically exploitable, so there is nothing to fix; the upstream package is used unmodified. | The audit no longer reports it. |

One advisory remains accepted without a patch, in `auditConfig.ignoreGhsas`:
zod GHSA-mrhx-c7xc-m3w5, through `@expo/cli`'s zod 3.x, which has no patched
release; the reason and the condition for removing it are written beside the
entry.

## Adding a local mitigation

When a high advisory has no upstream fix and cannot be shown unreachable,
patch the exact version: add a `patchedDependencies` entry and the patch file
under `patches/` (and copy `patches/` into the Docker install layer before
`pnpm install`), record the advisory, module, version, patch path and the
patch's SHA-256 in `scripts/security-mitigations.json`, and add fixtures to
`scripts/security-patches.test.cjs` that fail against the original package.
Never broaden an acceptance to another advisory or version.

## Removing one

When an upstream fixed release becomes available, update the dependency,
remove the `patchedDependencies` entry, the patch file and its record in
`security-mitigations.json`, keep the fixtures (pointed at the dependency the
way the tool that uses it resolves it), regenerate the lockfile, and run the
fixtures, the audit, the Expo checks and all workspace gates.
