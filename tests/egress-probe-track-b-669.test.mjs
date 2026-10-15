import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// issue #669 (B-0), docs/2.0/track-b-opendata-phase2-3-spec.md §3 / §8 item 1:
// every Track B upstream host that the spec marks 未驗證 must be probed from
// BOTH vantage points (the GitHub runner in egress-probe.yml, and the
// production host over the SSH loopback in scripts/gha-egress-probe-host.mjs),
// so the coordinating session can fill the spec's reachability table from a
// single workflow_dispatch run. Network probes are not unit-testable; like the
// repo's other workflow/source checks this asserts the source text so the two
// lists can't silently drift apart or lose a host.

// CRLF-normalised: a Windows checkout (core.autocrlf) hands back \r\n, CI doesn't.
const read = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const workflow = read("../.github/workflows/egress-probe.yml");
const hostScript = read("../scripts/gha-egress-probe-host.mjs");

// host -> the exact resource the Track B ticket that depends on it will fetch.
const TRACK_B_PROBES = {
  "www.tgos.tw": {
    why: "B-9 派出所 5958 ZIP download",
    resource: "9927eb8a-efed-40c0-8bc4-83121ad6834a/1150930.zip",
  },
  "newdatacenter.taichung.gov.tw": {
    why: "B-18 臺中 83558 即時位置",
    resource: "c923ad20-2ec6-43b9-b3ab-54527e99f7bc",
  },
  "soa.tainan.gov.tw": {
    why: "B-18 臺南 136310 即時位置",
    resource: "2c8a70d5-06f2-4353-9e92-c40d33bcd969",
  },
  "openapi.kcg.gov.tw": {
    why: "B-18 高雄 138256 即時位置",
    resource: "aaf4ce4b-4ca8-43de-bfaf-6dc97e89cac0",
  },
  "data.ntpc.gov.tw": {
    why: "B-16/B-17 新北 125664 路線 + 122972 即時位置",
    resource: "28ab4122-60e1-4065-98e5-abccb69aaca6",
  },
  "opdadm.moi.gov.tw": {
    why: "§8 item 1 的 7317 resource 路徑",
    resource: "82770E4D-D01D-441F-9FD4-FBE1E7B086F6",
  },
};

test("both probes cover every unverified Track B host, with the exact resource the ticket will fetch", () => {
  for (const [host, { why, resource }] of Object.entries(TRACK_B_PROBES)) {
    for (const [name, text] of [
      ["egress-probe.yml", workflow],
      ["gha-egress-probe-host.mjs", hostScript],
    ]) {
      assert.ok(text.includes(`https://${host}/`), `${name} must probe ${host} (${why})`);
      assert.ok(
        text.includes(resource),
        `${name} must probe the actual ${host} resource ${resource} (${why}), not just the site root`,
      );
    }
  }
});

test("the second data.ntpc.gov.tw resource (125664 route CSV) is probed from both vantage points", () => {
  const routes = "edc3ad26-8ae7-4916-a00b-bc6048d19bf8";
  assert.ok(workflow.includes(routes));
  assert.ok(hostScript.includes(routes));
});

test("both probes also cover the data.gov.tw 5958 URL resolver and the data.moa.gov.tw /api/v1/ forest-fire path (§3 marks the path-level reachability 未驗證)", () => {
  for (const [name, text] of [
    ["egress-probe.yml", workflow],
    ["gha-egress-probe-host.mjs", hostScript],
  ]) {
    assert.ok(text.includes("https://data.gov.tw/api/v2/rest/dataset/5958"), `${name}: 5958 URL resolver`);
    assert.ok(text.includes("https://data.moa.gov.tw/api/v1/ForestFireAlertWCF/"), `${name}: forest fire`);
  }
});

test("probes never pull the big files whole: the 28.9 MB 7317 CSV and the 3.6 MB NTPC route CSV are range-limited", () => {
  // A probe only needs the status line; downloading 28.9 MB from a shared
  // host (or burning the 20-25s budget on it) would be a pointless load.
  for (const [name, text] of [
    ["egress-probe.yml", workflow],
    ["gha-egress-probe-host.mjs", hostScript],
  ]) {
    assert.ok(text.includes("0-1023"), `${name} must send a 0-1023 byte Range for the large files`);
    assert.match(text, /["\s]-r\b/, `${name} must pass curl -r`);
  }
});

test("egress-probe.yml stays manual-only: this ticket must not make a probe run on its own", () => {
  const onBlock = /^on:\n((?: {2}.*\n|\n)+)/m.exec(workflow);
  assert.ok(onBlock, "expected a top-level `on:` block");
  const triggers = [...onBlock[1].matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
  assert.deepEqual(triggers, ["workflow_dispatch"]);
});

test("the host-side probe's job timeout is long enough for every target to time out at 20s", () => {
  const targetCount = hostScript
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line) && /"https:\/\//.test(line)).length;
  assert.ok(targetCount >= 14, `expected the host probe to list its targets, counted ${targetCount}`);

  const hostJob = workflow.slice(workflow.indexOf("probe-from-host:"));
  const timeoutMinutes = Number(/timeout-minutes:\s*(\d+)/.exec(hostJob)?.[1]);
  assert.ok(Number.isFinite(timeoutMinutes), "probe-from-host needs an explicit timeout-minutes");

  const worstCaseSeconds = targetCount * 20 + 60; // 20s curl cap each + ssh/setup slack
  assert.ok(
    timeoutMinutes * 60 >= worstCaseSeconds,
    `probe-from-host timeout-minutes=${timeoutMinutes} can't cover ${targetCount} targets x 20s (+60s slack = ${worstCaseSeconds}s); raise it so a block-everything day doesn't cancel the run mid-report`,
  );
});
