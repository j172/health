import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// httpClient.ts has `import "server-only"` at the top, which throws when
// imported outside the Next.js server build — same constraint as
// tests/no-server-fetch.test.mjs, so this scans the source text directly
// rather than importing the module.
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE_PATH = path.join(REPO_ROOT, "lib", "server", "net", "httpClient.ts");
const source = fs.readFileSync(SOURCE_PATH, "utf-8");

// Isolate the module-scope region (everything before the first function/const
// arrow-function definition that takes a request) from requestOnce()'s own
// body, so "declared once at module scope" vs "constructed per-request" can
// actually be told apart.
const requestOnceStart = source.indexOf("const requestOnce =");
const moduleScope = source.slice(0, requestOnceStart);
const requestOnceBody = source.slice(
  requestOnceStart,
  source.indexOf("export const httpRequest ="),
);

test("issue #401: a shared, keep-alive https.Agent (carrying ONE prebuilt SecureContext) is constructed once at module scope, not per-request", () => {
  // #699: the first fix put `ca: TRUSTED_CAS` on the Agent, but an Agent only forwards `ca` to tls.connect(), which builds
  // a fresh ~0.8 MB native SecureContext for every connection (150 connections = +118 MB RSS; shared: +4 MB). The CA list
  // must be turned into a SecureContext once, here, and that object handed to the Agent.
  assert.match(
    moduleScope,
    /SHARED_SECURE_CONTEXT\s*=\s*tls\.createSecureContext\(\s*\{\s*ca:\s*TRUSTED_CAS\s*\}\s*\)/,
    "expected the CA list to be built into one SecureContext at module scope",
  );
  assert.match(
    moduleScope,
    /new https\.Agent\(\s*\{[^}]*keepAlive:\s*true[^}]*secureContext:\s*SHARED_SECURE_CONTEXT/s,
    "expected a module-scope `new https.Agent({ keepAlive: true, ..., secureContext: SHARED_SECURE_CONTEXT })`",
  );
  assert.doesNotMatch(
    moduleScope,
    /new https\.Agent\(\s*\{[^}]*\bca:/s,
    "the Agent must not be given `ca` directly: that is a SecureContext per connection again",
  );
  assert.doesNotMatch(
    requestOnceBody,
    /new https\.Agent\(/,
    "requestOnce() must not construct a new https.Agent per call — that's the exact bug #401 reports",
  );
});

test("issue #401: a shared, keep-alive http.Agent exists for plain http:// requests", () => {
  assert.match(
    moduleScope,
    /new http\.Agent\(\s*\{[^}]*keepAlive:\s*true/s,
    "expected a module-scope `new http.Agent({ keepAlive: true, ... })`",
  );
});

test("issue #401: requestOnce() passes the shared agent, not an inline `ca` option, on every request", () => {
  assert.match(
    requestOnceBody,
    /agent:\s*parsed\.protocol === "https:" \? httpsAgent : httpAgent/,
    "requestOnce()'s request options must select the shared agent by protocol",
  );
  // The historical bug: `ca: TRUSTED_CAS` spread directly into the per-call
  // request options object (forcing a fresh tls.SecureContext every time).
  assert.doesNotMatch(
    requestOnceBody,
    /\{\s*ca:\s*TRUSTED_CAS\s*\}/,
    "requestOnce() must not inline `{ ca: TRUSTED_CAS }` into the per-request options anymore",
  );
});
