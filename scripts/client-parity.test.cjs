/** Keep Connect feature entry points available in both browser and native clients. */

const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const { test } = require("node:test");
const typescript = createRequire(path.resolve(__dirname, "../apps/web/package.json"))("typescript");
const ROOT = path.resolve(__dirname, "..");
// Browser Apple proof goes to Apple's HTTPS callback, then CompleteAppleSignIn.
// Native Apple proof comes from AuthenticationServices and uses this RPC instead.
const NATIVE_AUTH_METHOD = "authClient.logInWithApple";
// A browser has no Expo push token: only the native app registers a phone.
// Every other push RPC (switches, the list of phones, test, remove) is in both
// apps. Web Push would register the browser through this same RPC and end
// this exception.
const NATIVE_PUSH_METHOD = "pushClient.registerDevice";
// Find friends from contacts reads the device address book, which browsers
// cannot do, and is mobile-only for this release (docs/mobile-web-parity.md).
// The browser keeps the other half of the feature: the SetContactDiscovery
// switch, so a web-only person can still choose to be found.
const NATIVE_CONTACT_METHODS = ["socialClient.findContacts", "socialClient.sendFriendRequests"];
/** Methods only the native app may call, each for a documented platform reason. */
const NATIVE_ONLY_METHODS = new Set([NATIVE_AUTH_METHOD, NATIVE_PUSH_METHOD, ...NATIVE_CONTACT_METHODS]);

/** @param source TypeScript source. @returns Canonical client.method calls, including aliased imports. */
function clientCalls(source) {
  const parsed = typescript.createSourceFile("source.tsx", source, typescript.ScriptTarget.Latest, true, typescript.ScriptKind.TSX);
  const bindings = new Map();
  const calls = new Set();
  for (const statement of parsed.statements) {
    if (!typescript.isImportDeclaration(statement) || statement.moduleSpecifier.text !== "@/lib/api/connect") continue;
    const named = statement.importClause?.namedBindings;
    if (!named || !typescript.isNamedImports(named)) continue;
    for (const binding of named.elements) {
      const original = (binding.propertyName ?? binding.name).text;
      if (original.endsWith("Client")) bindings.set(binding.name.text, original);
    }
  }
  /** @param node Syntax node to scan, without counting comments or unrelated clients. */
  function visit(node) {
    if (typescript.isCallExpression(node)) {
      const access = node.expression;
      if (typescript.isPropertyAccessExpression(access) && typescript.isIdentifier(access.expression)) {
        const client = bindings.get(access.expression.text);
        if (client) calls.add(`${client}.${access.name.text}`);
      } else if (typescript.isElementAccessExpression(access) && typescript.isIdentifier(access.expression)) {
        const client = bindings.get(access.expression.text);
        if (client) {
          assert.ok(typescript.isStringLiteral(access.argumentExpression), "Use named Connect methods so parity remains auditable");
          calls.add(`${client}.${access.argumentExpression.text}`);
        }
      }
    }
    typescript.forEachChild(node, visit);
  }
  visit(parsed);
  return calls;
}

/** @param directory App source root. @returns Production UI source files, excluding backend and tests. */
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["server", "node_modules", "api", "__tests__"].includes(entry.name)) return [];
      return sourceFiles(filename);
    }
    return /\.tsx?$/.test(filename) && !/\.(test|spec)\./.test(filename) ? [filename] : [];
  });
}

/** @param directories App source roots. @returns Methods mapped to their implementing source files. */
function inventory(directories) {
  const methods = new Map();
  for (const filename of directories.flatMap((directory) => sourceFiles(path.join(ROOT, directory)))) {
    for (const method of clientCalls(readFileSync(filename, "utf8"))) {
      methods.set(method, [...(methods.get(method) ?? []), path.relative(ROOT, filename)]);
    }
  }
  return methods;
}

test("browser and native expose the same Connect feature entry points", (context) => {
  const browser = inventory(["apps/web/src"]);
  const native = inventory(["apps/mobile/src", "apps/mobile/app"]);
  assert.ok(browser.size > 40 && native.size > 40, "Both scans must include the real feature hooks");
  assert.ok(native.has(NATIVE_AUTH_METHOD), "The documented native Apple path must still exist");
  assert.ok(native.has(NATIVE_PUSH_METHOD), "The documented native push registration must still exist");
  for (const method of ["authClient.beginAppleSignIn", "authClient.completeAppleSignIn"]) {
    assert.ok(browser.has(method), `Browser Apple sign-in must retain ${method}`);
  }
  const gaps = [];
  for (const [method, filenames] of browser) {
    if (!native.has(method)) gaps.push(`Missing on native: ${method}\n  browser: ${filenames.join(", ")}`);
  }
  for (const method of NATIVE_CONTACT_METHODS) {
    assert.ok(native.has(method), `Native Find friends must still call ${method}`);
  }
  assert.ok(browser.has("authClient.setContactDiscovery") && native.has("authClient.setContactDiscovery"),
    "Both apps must let people choose whether contacts can find them");
  for (const [method, filenames] of native) {
    if (!browser.has(method) && !NATIVE_ONLY_METHODS.has(method)) {
      gaps.push(`Missing in browser: ${method}\n  native: ${filenames.join(", ")}`);
    }
  }
  assert.deepEqual(gaps, [], "A feature reached only one app. Implement both surfaces; document only genuine platform transport differences.");
  context.diagnostic(`${browser.size} common Connect methods; native Apple proof and push registration have separate transports, and contact lookup is native-only. This checks API reachability, not visual or end-to-end parity.`);
});

test("the scan includes aliases and bracket calls but excludes comments and query-cache clients", () => {
  assert.deepEqual([...clientCalls(`
    import { socialClient as social, authClient } from "@/lib/api/connect";
    // authClient.deleteAccount({});
    social.previewInviteLink({});
    authClient["getMe"]({});
    queryClient.clear();
  `)], ["socialClient.previewInviteLink", "authClient.getMe"]);
});
