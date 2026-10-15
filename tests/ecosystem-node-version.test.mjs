import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Issue #481: production was switched to Node 24 on 2026-10-13 via a one-off
// `pm2 restart health-web --interpreter .../v24.19.0/bin/node --update-env`
// that was never written back to ecosystem.config.cjs. Every deploy since
// runs `pm2 startOrRestart ecosystem.config.cjs --only health-web`, which
// re-reads this file — so it silently reverted the interpreter back to
// v20.20.2 on the very next deploy, and every deploy after that. Confirmed
// live 2026-10-15 (Day 2 of the 7-day observation period): `pm2 jlist`
// showed health-web back on v20.20.2. The 7-day observation window had
// actually been observing v20.20.2 the whole time.
test("ecosystem.config.cjs pins health-web to the Node version #481 actually switched to", () => {
  const src = fs.readFileSync(new URL("../ecosystem.config.cjs", import.meta.url), "utf8");
  assert.match(
    src,
    /interpreter:\s*'\/home\/tw123457\/\.nvm\/versions\/node\/v24\.19\.0\/bin\/node'/,
    "the committed interpreter path must match whatever pm2 was actually last switched to on production — a one-off `pm2 restart --interpreter` command alone does not survive the next deploy",
  );
});
