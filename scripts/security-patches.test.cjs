/** Regression tests for security fixes in build-tool dependencies; never relax signature checks. */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { generateKeyPairSync } = require('node:crypto');

// The copy Expo CLI actually loads, found the way it finds it: the app
// depends on expo, expo on @expo/cli, and @expo/cli on node-forge.
const mobileRequire = createRequire(resolve(__dirname, '../apps/mobile/package.json'));
const expoRequire = createRequire(mobileRequire.resolve('expo/package.json'));
const cliRequire = createRequire(expoRequire.resolve('@expo/cli/package.json'));
const forge = cliRequire('node-forge');

const keys = generateKeyPairSync('rsa', { modulusLength: 1024, publicExponent: 3 });
const privateKey = forge.pki.privateKeyFromPem(keys.privateKey.export({ format: 'pem', type: 'pkcs1' }));
const publicKey = forge.pki.publicKeyFromPem(keys.publicKey.export({ format: 'pem', type: 'spki' }));
const digest = forge.md.sha256.create().update('Release security regression').digest().getBytes();

/**
 * Constructs RSA signatures with controlled DigestInfo encodings, including invalid nested elements.
 * @param parameters Algorithm parameters (NULL, omitted, or malicious additions).
 * @returns PKCS#1 signature bytes over the custom ASN.1 encoding.
 */
function signature(parameters) {
  const asn1 = forge.asn1;
  const algorithm = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(forge.oids.sha256).getBytes()), ...parameters,
  ]);
  const information = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [algorithm,
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digest)]);
  return privateKey.sign(asn1.toDer(information).getBytes(), 'NONE');
}

/** @returns A correctly empty ASN.1 NULL algorithm parameter. */
function nullParameter() { return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''); }

test('Expo CLI loads node-forge 1.4.1 or later, the release that fixes GHSA-86w9-cpqp-85rv', () => {
  const [major, minor, patch] = cliRequire('node-forge/package.json').version.split('.').map(Number);
  assert.ok(major > 1 || (major === 1 && (minor > 4 || (minor === 4 && patch >= 1))));
});
test('RSA accepts standard SHA-256 parameters and the permitted omitted-parameter form', () => {
  assert.equal(publicKey.verify(digest, signature([nullParameter()])), true);
  assert.equal(publicKey.verify(digest, signature([])), true);
});
test('RSA rejects extra nested algorithm elements with a low-exponent key', () => {
  const extra = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, 'garbage');
  assert.throws(() => publicKey.verify(digest, signature([nullParameter(), extra])), /DigestInfo/);
  assert.throws(() => publicKey.verify(digest, signature([extra])), /DigestInfo/);
});
test('RSA rejects a NULL algorithm parameter containing hidden bytes', () => {
  const malformed = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, 'hidden');
  assert.throws(() => publicKey.verify(digest, signature([malformed])), /DigestInfo/);
});
