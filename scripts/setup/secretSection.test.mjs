/** Guards credential preservation while rearranging local dotenv files for easy editing. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { test } from "node:test";
import { SECRET_SECTION_HEADER } from "./environment.constants.mjs";
import { groupSecretSection } from "./secretSection.mjs";

test("public IDs stay above one final secrets section, with effective credentials preserved", () => {
  const source = '# Application settings\nAPPLE_KEY_ID=PUBLICKEY\n# Database password note\nPOSTGRES_PASSWORD="first fixture"\nGOOGLE_CLIENT_ID=public-client\nPOSTGRES_PASSWORD="effective fixture"\nTWILIO_API_KEY_SID=public-sid\nTWILIO_API_KEY_SECRET="twilio fixture"\nAPPLE_PRIVATE_KEY_FILE="/path with spaces/AppleAuthKey.p8"\n';
  const result = groupSecretSection(source);
  assert.deepEqual(parseEnv(result), parseEnv(source));
  const [ordinary, secrets] = result.split(SECRET_SECTION_HEADER);
  assert.ok(ordinary.includes("APPLE_KEY_ID=PUBLICKEY"));
  assert.ok(ordinary.includes("TWILIO_API_KEY_SID=public-sid"));
  assert.ok(!ordinary.includes("POSTGRES_PASSWORD="));
  assert.ok(secrets.includes('# Database password note\nPOSTGRES_PASSWORD="effective fixture"'));
  assert.equal(result.match(/^POSTGRES_PASSWORD=/gm).length, 1);
  assert.ok(!result.includes("first fixture"));
  assert.equal(groupSecretSection(result), result);
});

test("quoted multiline secrets and assignment-like text remain byte-for-byte intact", () => {
  const credential = `export APPLE_PRIVATE_KEY='first fixture line\nSESSION_SECRET=not-an-assignment\n${SECRET_SECTION_HEADER}\nlast fixture line' # keep this comment\n`;
  const source = `# Key instructions\n${credential}GOOGLE_CLIENT_ID=public-client\nSESSION_SECRET="literal $cash # quote-free fixture"\nDATABASE_URL=postgres://fixture:password@localhost/example\n`;
  const result = groupSecretSection(source);
  assert.ok(result.includes(credential));
  assert.ok(result.includes("# Key instructions\nexport APPLE_PRIVATE_KEY="));
  assert.deepEqual(parseEnv(result), parseEnv(source));
  assert.equal(groupSecretSection(result), result);
});

test("public multiline values, CRLF, backticks and secret-file settings preserve parsed values", () => {
  const source = 'PUBLIC_NOTE="line one\r\nSESSION_SECRET=only text\r\nline three"\r\nSESSION_SECRET_FILE="/private/key file"\r\nCOMPATIBLE_AI_API_KEY=`literal # api fixture`\r\nSESSION_SECRET_PREVIOUS=\r\nPUBLIC_LAST=value\r\n';
  const result = groupSecretSection(source);
  assert.deepEqual(parseEnv(result), parseEnv(source));
  assert.ok(result.indexOf("PUBLIC_LAST=") < result.indexOf(SECRET_SECTION_HEADER));
  assert.equal(groupSecretSection(result), result);
});

test("later public defaults move above the footer without duplicating its heading", () => {
  const initial = groupSecretSection("SESSION_SECRET=fixture\nPUBLIC_FIRST=value\n");
  const result = groupSecretSection(`${initial}\nPUBLIC_NEW=value\n`);
  assert.equal(result.split(SECRET_SECTION_HEADER).length, 2);
  assert.ok(result.indexOf("PUBLIC_NEW=") < result.indexOf(SECRET_SECTION_HEADER));
  assert.equal(groupSecretSection(result), result);
});

test("the checked-in template already has the stable final secrets layout", () => {
  const example = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
  assert.equal(groupSecretSection(example), example);
});
