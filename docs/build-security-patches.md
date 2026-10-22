<!-- Exact-version security mitigations for Expo/Metro tooling, reviewed 2026-10-05. -->

# Build dependency security patches

Run `pnpm audit:production`. The gate runs regression fixtures, verifies each
patch's SHA-256, then queries the production dependency audit. Every other high
or critical advisory fails. A registry error also fails. The raw
`pnpm audit --prod` still reports the two affected version numbers because a
local patch does not change npm's published version metadata.

| Package and advisory | Local mitigation | Verification |
| --- | --- | --- |
| `node-forge@1.4.0`, [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | Reject extra elements in the nested DigestAlgorithm sequence and nonempty ASN.1 NULL parameters. Preserve the allowed omitted-parameter encoding. | Valid SHA-256 signatures pass; malformed nested encodings fail with a generated exponent-3 key. |
| `braces@3.0.3`, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Bound parser nesting, AST walkers, and array flattening at 128 levels. | Ordinary compile/expand/stringify and numeric ranges pass; deeply nested patterns and cyclic ASTs fail with a controlled error. |

Both advisories reported no published patched version on October 5, 2026. These
are repository-maintained mitigations, not upstream releases. pnpm applies the
version-specific patches during a frozen install, including EAS builds. The
Docker install layer copies `patches/` before installation. Direct development
fixtures do not enter either application bundle.

All seven fixtures pass with the patches. Four security cases fail against the
original packages. One fixture also checks that Expo CLI and Metro resolve the
same patched implementations as the tests. Authentication token verification
uses `jose` and Node crypto; the affected RSA dependency comes through Expo's
build tooling.

When an upstream fixed release becomes available, update the dependency,
remove the corresponding `patchedDependencies` entry and patch file, remove its
exact advisory acceptance from `scripts/security-mitigations.json`, regenerate
the lockfile, and run the regression fixtures, audit, Expo checks, and all
workspace gates. Do not broaden the acceptance to a new advisory or version.
