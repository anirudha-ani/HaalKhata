/** Regression tests for exact-version build-tool mitigations; never relax signature checks or recursion bounds. */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { realpathSync } = require('node:fs');
const forge = require('node-forge');
const braces = require('braces');
const { generateKeyPairSync } = require('node:crypto');
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
test('ordinary brace compilation, expansion, and stringification keep their API', () => {
  assert.deepEqual(braces.expand('app/{ios,android}/{one,two}'), ['app/ios/one', 'app/ios/two', 'app/android/one', 'app/android/two']);
  assert.equal(braces.compile('app/{ios,android}'), 'app/(ios|android)');
  assert.equal(braces.stringify('app/{ios,android}'), 'app/{ios,android}');
  assert.deepEqual(braces.expand('{1..3}'), ['1', '2', '3']);
});
test('deep brace and parenthesis input fails with a controlled bound, before stack exhaustion', () => {
  for (const pattern of ['{'.repeat(1000) + 'x' + '}'.repeat(1000), '('.repeat(1000) + 'x' + ')'.repeat(1000)]) {
    for (const method of [braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => method(pattern), /maximum depth/);
    }
  }
});
test('direct AST walkers reject cyclic/unbounded structures too', () => {
  const tree = { type: 'root', nodes: [], queue: [] }; tree.nodes.push(tree);
  for (const method of [braces.compile, braces.expand, braces.stringify]) assert.throws(() => method(tree), /maximum depth/);
});

test('Expo CLI and Metro resolve the exact patched packages exercised by these fixtures', () => {
  const mobileRequire = createRequire(resolve(__dirname, '../apps/mobile/package.json'));
  const expoRequire = createRequire(mobileRequire.resolve('expo/package.json'));
  const cliRequire = createRequire(expoRequire.resolve('@expo/cli/package.json'));
  const mapperRequire = createRequire(cliRequire.resolve('metro-file-map/package.json'));
  const micromatchRequire = createRequire(mapperRequire.resolve('micromatch/package.json'));
  assert.equal(realpathSync(cliRequire.resolve('node-forge')), realpathSync(require.resolve('node-forge')));
  assert.equal(realpathSync(micromatchRequire.resolve('braces')), realpathSync(require.resolve('braces')));
});
