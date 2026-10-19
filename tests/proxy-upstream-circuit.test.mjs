import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// #709: while health-web is down or hung, every visitor request used to hold a ~100 MB lsphp
// worker for up to 2 x 30 s; 4-5 of them pushed the account over its 1 GB limit and got
// health-web killed again. The proxy path now has an upstream circuit: a refused connection (or
// two timeouts within 15 s) answers 503 + Retry-After for 5 s without touching curl.
const src = fs.readFileSync(new URL("../.remote-health-index.php", import.meta.url), "utf8");
const code = src
  .split(/\r?\n/)
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join("\n");

test("the proxy answers 503 with Retry-After and no-store while the circuit is open", () => {
  assert.match(code, /if \(\$upstreamState\['until'\] > time\(\)\) \{[\s\S]*?http_response_code\(503\);[\s\S]*?Retry-After[\s\S]*?Cache-Control: no-store[\s\S]*?exit;/);
  // long-running admin/internal calls are exempt from the gate
  assert.match(code, /if \(!\$isLongRunningApi\) \{\s*\$upstreamState = \$readUpstreamState\(\);/);
});

test("worker hold time is bounded: 20 s visitor timeout, 2 s connect, retry only on a refused connection", () => {
  assert.match(code, /CURLOPT_TIMEOUT\s*=>\s*\$isLongRunningApi \? 280 : 20/);
  assert.match(code, /CURLOPT_CONNECTTIMEOUT\s*=>\s*2/);
  assert.match(code, /\$attempt < \$maxAttempts && \$lastCurlErrno === 7/);
});

const phpAvailable = spawnSync("php", ["-v"], { encoding: "utf8" }).status === 0;

test("circuit state machine (real PHP, extracted from the front controller)", { skip: !phpAvailable && "php not installed" }, () => {
  const start = src.indexOf("$upstreamStateFile = ");
  const gate = /if \(!\$isLongRunningApi\) \{\r?\n\s*\$upstreamState = /.exec(src.slice(start));
  const end = gate ? start + gate.index : -1;
  assert.ok(start > 0 && end > start, "could not locate the circuit helpers");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "proxy-circuit-"));
  const stateFile = path.join(dir, "state.json").split(path.sep).join("/");
  const helpers = src
    .slice(start, end)
    .replace(/\$upstreamStateFile = '[^']*';/, `$upstreamStateFile = '${stateFile}';`);
  const script = `<?php
${helpers}
$out = [];
$snap = static function () use ($readUpstreamState) { $s = $readUpstreamState(); return ['open' => $s['until'] > time(), 'fails' => count($s['fails'])]; };
$out['start'] = $snap();
$recordUpstreamFailure(28);                 // one timeout: just remembered
$out['one_timeout'] = $snap();
$recordUpstreamFailure(28);                 // second within the window: opens
$out['two_timeouts'] = $snap();
$writeUpstreamState(0, []);                 // an HTTP answer clears it
$out['cleared'] = $snap();
$out['cleared_file_removed'] = !file_exists($upstreamStateFile);
$recordUpstreamFailure(7);                  // refused connection: opens at once
$out['refused'] = $snap();
$writeUpstreamState(0, []);
$recordUpstreamFailure(6);                  // DNS error: not an upstream-down signal
$out['dns'] = $snap();
$writeUpstreamState(0, [time() - 60]);      // an old failure outside the 15 s window
$recordUpstreamFailure(56);
$out['stale_then_one'] = $snap();
$writeUpstreamState(0, []);
file_put_contents($upstreamStateFile, '{not json');
$out['corrupt_file'] = $snap();
echo json_encode($out);
`;
  const scriptPath = path.join(dir, "t.php");
  fs.writeFileSync(scriptPath, script);
  const run = spawnSync("php", [scriptPath], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const r = JSON.parse(run.stdout);
  assert.deepEqual(r.start, { open: false, fails: 0 });
  assert.deepEqual(r.one_timeout, { open: false, fails: 1 });
  assert.equal(r.two_timeouts.open, true);
  assert.deepEqual(r.cleared, { open: false, fails: 0 });
  assert.equal(r.cleared_file_removed, true);
  assert.equal(r.refused.open, true);
  assert.deepEqual(r.dns, { open: false, fails: 0 });
  assert.deepEqual(r.stale_then_one, { open: false, fails: 1 });
  assert.deepEqual(r.corrupt_file, { open: false, fails: 0 });
  fs.rmSync(dir, { recursive: true, force: true });
});
