import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Issue #455's first live apply attempt failed with "cannot write to
// read-only value `using_latest_model`" — the bot_management PUT body was
// built by spreading Cloudflare's GET response verbatim, which includes
// read-only fields a PUT must omit entirely, not just leave unchanged.
// cloudflare-zone-apply.mjs calls the real Cloudflare API directly and has
// no exported pure function to unit test, so this is a source-text
// regression guard (this repo's established convention for scripts that
// can't be isolated from the network call — see tests/*.test.mjs's
// "source-text inspection" pattern for JSX/DB-backed files) confirming the
// fix's destructuring-omit shape is still present.

const ROOT_DIR = fileURLToPath(new URL("../", import.meta.url));
const src = fs.readFileSync(path.join(ROOT_DIR, "scripts", "cloudflare-zone-apply.mjs"), "utf-8");

test("cloudflare-zone-apply.mjs strips using_latest_model and stale_zone_configuration before PUTting bot_management", () => {
  assert.match(
    src,
    /const\s*\{\s*using_latest_model,\s*stale_zone_configuration,\s*\.\.\.liveBotManagementWritable\s*\}\s*=\s*liveBotManagement;/,
    "must destructure out both known read-only bot_management fields before building the PUT body",
  );
  const mergedIdx = src.indexOf("const merged = {");
  assert.ok(mergedIdx !== -1, "expected a `const merged = {` bot_management PUT body construction");
  const mergedBlock = src.slice(mergedIdx, mergedIdx + 200);
  assert.match(
    mergedBlock,
    /\.\.\.liveBotManagementWritable/,
    "the merged PUT body must spread the read-only-stripped object, not the raw live GET response",
  );
  assert.doesNotMatch(
    mergedBlock,
    /\.\.\.liveBotManagement[,\s]/,
    "must not spread the raw liveBotManagement (which still carries the read-only fields) into the PUT body",
  );
});

test("cloudflare-zone-apply.mjs's error handler surfaces CloudflareApiError's actual response body, not just the HTTP status message", () => {
  assert.match(
    src,
    /err\?\.name === "CloudflareApiError" && err\.body/,
    "must check for and print the Cloudflare API's real error body on failure",
  );
});
