/** Exercises the real deployment config parser with disposable secrets, never a production host. */

const assert = require('node:assert/strict');
const { generateKeyPairSync, randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');

const DEPLOY_SOURCE = readFileSync(join(__dirname, 'deploy-release.sh'), 'utf8');
// Stop at the deployment boundary; all parser/functions are the actual source.
const CONFIG_SCRIPT = DEPLOY_SOURCE.split('# IMAGE_TAG is read')[0].replace('cd /srv/haalkhata\n', '');
const TEST_TAG = 'a'.repeat(40);
const ENCRYPTION_KEY = randomBytes(32).toString('hex');
const PRIVATE_KEY = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey
  .export({ format: 'pem', type: 'pkcs8' });

/**
 * Creates an isolated directory and a portable timeout shim for macOS test runs.
 * @param context Node test context, used to register cleanup.
 * @returns Fixture paths and a function invoking the unchanged config parser.
 */
function fixture(context) {
  const directory = mkdtempSync(join(tmpdir(), 'haalkhata-deploy-test-'));
  const binaries = join(directory, 'bin');
  mkdirSync(binaries);
  // The parent process provides a real timeout; only GNU's CLI is shimmed.
  writeFileSync(join(binaries, 'timeout'), '#!/bin/sh\nshift\nexec "$@"\n', { mode: 0o700 });
  writeFileSync(join(directory, '.env'), '');
  writeFileSync(join(directory, 'config.sh'), CONFIG_SCRIPT);
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return {
    directory,
    /**
     * Applies config to this isolated fixture.
     * @param input Deployment protocol payload.
     * @returns Captured parser exit status and output.
     */
    applyConfig(input = '') {
      return spawnSync('sh', ['config.sh', TEST_TAG, directory], {
        cwd: directory, encoding: 'utf8', input, timeout: 10_000,
        env: { ...process.env, PATH: `${binaries}:${process.env.PATH}`, SSH_ORIGINAL_COMMAND: TEST_TAG },
      });
    },
  };
}

/**
 * Encodes a generated private key exactly as the workflow's one-line protocol.
 * @param privateKey PEM text from a disposable test key.
 * @returns Config line, including its terminating newline.
 */
function privateKeyLine(privateKey = PRIVATE_KEY) {
  return `APPLE_PRIVATE_KEY_BASE64=${Buffer.from(privateKey).toString('base64')}\n`;
}

test('installs multiline PKCS#8 and encryption keys as protected files, never .env or logs', (context) => {
  const server = fixture(context);
  const result = server.applyConfig(`APPLE_TEAM_ID=TEAMEXAMPLE\nAPPLE_TOKEN_ENCRYPTION_KEY=${ENCRYPTION_KEY}\n${privateKeyLine()}`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(server.directory, 'secrets/apple_private_key'), 'utf8'), PRIVATE_KEY);
  assert.equal(readFileSync(join(server.directory, 'secrets/apple_token_encryption_key'), 'utf8'), ENCRYPTION_KEY);
  assert.equal(statSync(join(server.directory, 'secrets')).mode & 0o777, 0o700);
  for (const name of ['apple_private_key', 'apple_token_encryption_key']) {
    assert.equal(statSync(join(server.directory, 'secrets', name)).mode & 0o777, 0o444);
  }
  assert.equal(readFileSync(join(server.directory, '.env'), 'utf8'), 'APPLE_TEAM_ID=TEAMEXAMPLE\n');
  assert.equal(result.stdout + result.stderr, '');
});

test('unset GitHub secrets and rollback without config preserve installed files', (context) => {
  const server = fixture(context);
  assert.equal(server.applyConfig(`APPLE_TOKEN_ENCRYPTION_KEY=${ENCRYPTION_KEY}\n${privateKeyLine()}`).status, 0);
  assert.equal(server.applyConfig('APPLE_TOKEN_ENCRYPTION_KEY=\nAPPLE_PRIVATE_KEY_BASE64=\n').status, 0);
  assert.equal(server.applyConfig().status, 0);
  assert.equal(readFileSync(join(server.directory, 'secrets/apple_private_key'), 'utf8'), PRIVATE_KEY);
  assert.equal(readFileSync(join(server.directory, 'secrets/apple_token_encryption_key'), 'utf8'), ENCRYPTION_KEY);
});

test('identical encryption keys work repeatedly, while replacement cannot strand stored grants', (context) => {
  const server = fixture(context);
  assert.equal(server.applyConfig(`APPLE_TOKEN_ENCRYPTION_KEY=${ENCRYPTION_KEY}\n`).status, 0);
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), initializationVector);
  const ciphertext = Buffer.concat([cipher.update('existing-apple-refresh-token'), cipher.final()]);
  assert.equal(server.applyConfig(`APPLE_TOKEN_ENCRYPTION_KEY=${ENCRYPTION_KEY.toUpperCase()}\n`).status, 0);
  const replacement = randomBytes(32).toString('hex');
  const result = server.applyConfig(`APPLE_TOKEN_ENCRYPTION_KEY=${replacement}\n`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /differs from the installed key/);
  assert.ok(!result.stderr.includes(replacement));
  const installedKey = readFileSync(join(server.directory, 'secrets/apple_token_encryption_key'), 'utf8');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(installedKey, 'hex'), initializationVector);
  decipher.setAuthTag(cipher.getAuthTag());
  assert.equal(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(), 'existing-apple-refresh-token');
});

test('invalid encoding, private keys, and encryption values preserve working secrets', (context) => {
  const server = fixture(context);
  assert.equal(server.applyConfig(`APPLE_TOKEN_ENCRYPTION_KEY=${ENCRYPTION_KEY}\n${privateKeyLine()}`).status, 0);
  const otherCurve = generateKeyPairSync('ec', { namedCurve: 'secp384r1' }).privateKey
    .export({ format: 'pem', type: 'pkcs8' });
  const otherFormat = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey
    .export({ format: 'pem', type: 'sec1' });
  for (const input of [
    'APPLE_PRIVATE_KEY_BASE64=bad base64!\n', privateKeyLine('not a PEM key'),
    privateKeyLine(otherCurve), privateKeyLine(otherFormat),
    'APPLE_TOKEN_ENCRYPTION_KEY=too-short\n', `APPLE_TOKEN_ENCRYPTION_KEY=${'z'.repeat(64)}\n`,
  ]) {
    const result = server.applyConfig(input);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refusing:/);
    assert.ok(!result.stderr.includes(PRIVATE_KEY));
    assert.ok(!result.stderr.includes(ENCRYPTION_KEY));
    assert.equal(readFileSync(join(server.directory, 'secrets/apple_private_key'), 'utf8'), PRIVATE_KEY);
    assert.equal(readFileSync(join(server.directory, 'secrets/apple_token_encryption_key'), 'utf8'), ENCRYPTION_KEY);
    assert.deepEqual(readdirSync(join(server.directory, 'secrets')).sort(), ['apple_private_key', 'apple_token_encryption_key']);
  }
});

test('a comma-and-space list deploys as the list it names, and other characters are still refused', (context) => {
  const server = fixture(context);
  const result = server.applyConfig('ADMIN_EMAILS= ops@example.com, second@example.org \n');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(server.directory, '.env'), 'utf8'), 'ADMIN_EMAILS=ops@example.com,second@example.org\n');
  const refused = server.applyConfig('ADMIN_EMAILS=ops@example.com;rm -rf /\n');
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /refusing: ADMIN_EMAILS/);
});

test('the new secret handling still rejects non-allowlisted destinations', (context) => {
  const server = fixture(context);
  assert.notEqual(server.applyConfig('ARBITRARY_FILE=/tmp/anything\n').status, 0);
  assert.equal(readFileSync(join(server.directory, '.env'), 'utf8'), '');
});

test('the Expo push token lands as a protected secret file, never in .env, and an empty value keeps it', (context) => {
  const server = fixture(context);
  const token = 'expo-access-token-for-tests_0123';
  const result = server.applyConfig(`EXPO_ACCESS_TOKEN=${token}\n`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(server.directory, 'secrets/expo_access_token'), 'utf8'), token);
  assert.equal(statSync(join(server.directory, 'secrets/expo_access_token')).mode & 0o777, 0o444);
  assert.equal(readFileSync(join(server.directory, '.env'), 'utf8'), '');
  assert.equal(result.stdout + result.stderr, '');
  assert.equal(server.applyConfig('EXPO_ACCESS_TOKEN=\n').status, 0);
  assert.equal(readFileSync(join(server.directory, 'secrets/expo_access_token'), 'utf8'), token);
});
