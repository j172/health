import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Issue #600/#605: import-mohw-facilities.mjs's importLongTermCare() was
// superseded by scripts/import-mohw-ltc-gis.mjs back in #285, but was never
// deleted. It wrote degraded long-term-care records (serviceItem hardcoded
// to null) under the same sourceKey, "mohw_ltc_full", that the newer script
// also writes — so re-running this old script would silently clobber the
// better data back to the degraded version. #605 removed the dead function
// and its call site. This script has no exported pure functions to unit
// test (it fetches live CSVs and POSTs to a production admin endpoint), so
// this is a source-text regression guard (this repo's established
// convention for scripts that can't be isolated from the network call —
// see cloudflare-zone-apply-bot-management.test.mjs) confirming the dead
// code doesn't come back.

const ROOT_DIR = fileURLToPath(new URL("../", import.meta.url));
const src = fs.readFileSync(path.join(ROOT_DIR, "scripts", "import-mohw-facilities.mjs"), "utf-8");

test("import-mohw-facilities.mjs no longer defines importLongTermCare", () => {
  assert.doesNotMatch(
    src,
    /function\s+importLongTermCare/,
    "importLongTermCare() was removed in #605 — it must not be reintroduced, since it would clobber " +
      "import-mohw-ltc-gis.mjs's better data back to a degraded version under the shared sourceKey " +
      '"mohw_ltc_full"',
  );
  assert.doesNotMatch(
    src,
    /await\s+importLongTermCare\s*\(/,
    "no call site for importLongTermCare() should remain either",
  );
});

test("import-mohw-facilities.mjs's main() still runs the health-check import", () => {
  assert.match(
    src,
    /async function main\s*\(\)\s*\{[\s\S]*importHealthCheck\(\)/,
    "main() must still call importHealthCheck() — removing the dead long-term-care import must not break this",
  );
});
