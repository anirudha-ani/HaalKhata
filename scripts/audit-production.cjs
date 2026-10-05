/** Production audit gate: only exact, locally patched advisories with passing regressions are accepted. */

const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { resolve } = require('node:path');
const ROOT_DIRECTORY = resolve(__dirname, '..');
const MITIGATIONS = require('./security-mitigations.json');

for (const mitigation of Object.values(MITIGATIONS)) {
  const patch = readFileSync(resolve(ROOT_DIRECTORY, mitigation.patch));
  if (createHash('sha256').update(patch).digest('hex') !== mitigation.sha256) {
    throw new Error('Security patch changed; review the mitigation and update its regression fixtures before accepting an advisory.');
  }
}
const regressions = spawnSync(process.execPath, ['--test', 'scripts/security-patches.test.cjs'], { cwd: ROOT_DIRECTORY, stdio: 'inherit' });
if (regressions.status !== 0) process.exit(1);
const scan = spawnSync('pnpm', ['audit', '--prod', '--json'], { cwd: ROOT_DIRECTORY, encoding: 'utf8', timeout: 120000, maxBuffer: 100 * 1024 * 1024 });
if (scan.error || ![0, 1].includes(scan.status)) throw new Error('Dependency audit could not finish; refusing to bypass the registry check.');
const audit = JSON.parse(scan.stdout);
if (!audit.advisories || audit.error || audit.message) throw new Error('Registry returned an invalid audit response.');
let failures = 0;
for (const advisory of Object.values(audit.advisories)) {
  if (!['high', 'critical'].includes(advisory.severity)) continue;
  const mitigation = MITIGATIONS[advisory.github_advisory_id];
  const verified = mitigation && advisory.module_name === mitigation.module && advisory.findings.length > 0 &&
    advisory.findings.every((finding) => finding.version === mitigation.version);
  if (verified) console.log(`Locally mitigated: ${advisory.github_advisory_id} (${mitigation.module}@${mitigation.version}; reviewed patch and regressions passed).`);
  else { failures++; console.error(`Unmitigated ${advisory.severity}: ${advisory.module_name} — ${advisory.url}`); }
}
if (failures) process.exit(1);
console.log('Production audit passed: no unmitigated high/critical advisories.');
