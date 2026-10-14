/** Local startup requires its database credential, never optional Apple configuration. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { assertDevelopmentDatabasePassword } from "./development.mjs";

test("a configured database starts without any Apple settings", () => {
  assert.doesNotThrow(() => assertDevelopmentDatabasePassword({ POSTGRES_PASSWORD: "local-fixture" }));
});

test("missing database credentials produce one actionable error without leaking values", () => {
  for (const password of [undefined, "", "   "]) {
    assert.throws(() => assertDevelopmentDatabasePassword({ POSTGRES_PASSWORD: password }), /Set POSTGRES_PASSWORD in the Secrets section/);
  }
});
