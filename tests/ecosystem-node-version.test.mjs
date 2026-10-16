import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// History (issue #481): production was switched to Node 24 on 2026-10-13 via a
// one-off `pm2 restart --interpreter` that was never written back to
// ecosystem.config.cjs, so every deploy silently reverted to v20.20.2 until
// #634 pinned v24.19.0 here (2026-10-15). From that moment the web process
// began aborting 10-25 times per hour: the host caps this account's address
// space at 2 GiB (RLIMIT_AS), and Node 24.19 idles at 1.29 GB virtual size vs
// 0.74 GB for Node 20.20.2, leaving ~550 MB less headroom — V8 died with
// "Committing semi space failed" at only ~300 MB of heap. Rolled back to
// v20.20.2 on 2026-10-16.
//
// The interpreter committed here is what every deploy re-applies, so it must be
// pinned explicitly (a one-off `pm2 restart --interpreter` does not survive the
// next deploy). Moving to Node 24 again needs a measurement first: an idle
// `node` on the host must leave comfortable room under the 2 GiB address-space
// limit, and the running process's VmPeak must stay well below it.
test("ecosystem.config.cjs pins health-web to Node 20.20.2 (Node 24 exhausts the host's 2 GiB address-space limit)", () => {
  const src = fs.readFileSync(new URL("../ecosystem.config.cjs", import.meta.url), "utf8");
  const code = src
    .split(/\r?\n/)
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
  assert.match(
    code,
    /interpreter:\s*'\/home\/tw123457\/\.nvm\/versions\/node\/v20\.20\.2\/bin\/node'/,
    "health-web must run on the Node version the host can actually fit under its 2 GiB RLIMIT_AS",
  );
  assert.doesNotMatch(code, /v24\./, "do not point the interpreter at Node 24 without re-measuring its virtual size on the host");
});
