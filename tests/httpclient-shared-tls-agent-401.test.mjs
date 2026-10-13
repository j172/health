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

test("issue #401: a shared, keep-alive https.Agent (carrying TRUSTED_CAS) is constructed once at module scope, not per-request", () => {
  assert.match(
    moduleScope,
    /new https\.Agent\(\s*\{[^}]*keepAlive:\s*true[^}]*ca:\s*TRUSTED_CAS/s,
    "expected a module-scope `new https.Agent({ keepAlive: true, ..., ca: TRUSTED_CAS })`",
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
