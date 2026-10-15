import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Production incident 2026-10-15 (same day as the redirect-Refresh-header
// fix in #654): a programmatic rewrite of next.config.js's redirects()
// function silently dropped the trailing `module.exports = nextConfig;`
// line. `node -e "require('./next.config.js')"` still "succeeded" — a
// CommonJS module with no exports assignment just returns `{}`, which is
// valid, not a syntax error — so this passed every check run at the time
// (tsc, eslint, require() sanity check). Next.js's build then silently fell
// back to defaults for everything in next.config.js, including `distDir`:
// `next build` kept completing successfully and generating all pages, just
// into the default `.next` directory instead of the configured `.next3` —
// which broke every deploy's "Package prebuilt bundle" step
// (`test -d .next3`) without ever producing a build-time error to explain
// why.
test("next.config.js actually exports its config object (would have caught #654's dropped module.exports)", () => {
  const require = createRequire(import.meta.url);
  const configPath = fileURLToPath(new URL("../next.config.js", import.meta.url));
  // Bypass any stale require() cache from an earlier test in the same run.
  delete require.cache[require.resolve(configPath)];
  const config = require(configPath);

  assert.notEqual(config, undefined, "next.config.js must export something, not undefined");
  assert.notDeepEqual(config, {}, "next.config.js must not silently export an empty object — check for a missing `module.exports =` line");
  assert.equal(config.distDir, ".next3", "the configured distDir must actually be exported (this is exactly what #654's incident silently lost)");
  assert.equal(typeof config.redirects, "function", "redirects() must actually be exported");
  assert.equal(typeof config.headers, "function", "headers() must actually be exported");
});
