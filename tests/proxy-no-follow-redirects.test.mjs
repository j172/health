import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// 2026-10-15: every redirect Next emitted (config 308, middleware 301, even the
// built-in trailing-slash redirect) came back as a LiteSpeed 500 because the PHP
// front controller let curl follow redirects and then re-emitted the
// concatenated header blocks. It must pass 3xx responses through untouched.
test("PHP proxy does not let curl follow upstream redirects", () => {
  const src = fs.readFileSync(new URL("../.remote-health-index.php", import.meta.url), "utf8");
  const code = src
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
  assert.match(code, /CURLOPT_FOLLOWLOCATION\s*=>\s*false/);
  assert.doesNotMatch(code, /CURLOPT_FOLLOWLOCATION\s*=>\s*true/);
});
