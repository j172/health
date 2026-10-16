import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Issue #691 (今天要上班上課嗎？): www.dgpa.gov.tw has never been probed from the
// GitHub runner or the production host, and both halves of that tool depend on
// it — the office-calendar CSVs data.gov.tw 14718 points at are served from
// www.dgpa.gov.tw/FileConversion, and the closure-announcement page
// (typh/daily/nds.html) is what the page links to. Same arrangement and same
// "assert the source text" approach as tests/egress-probe-track-b-669.test.mjs
// (network probes aren't unit-testable): both probe lists must carry the same
// three URLs so one workflow_dispatch run answers the question for both vantage
// points. The workflow must stay manual-only — this change must not make a
// probe run on its own.

// CRLF-normalised: a Windows checkout (core.autocrlf) hands back \r\n, CI doesn't.
const read = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const workflow = read("../.github/workflows/egress-probe.yml");
const hostScript = read("../scripts/gha-egress-probe-host.mjs");

const DGPA_PROBES = {
  "data.gov.tw metadata resolver for dataset 14718": "https://data.gov.tw/api/v2/rest/dataset/14718",
  "the 116 (2027) calendar CSV on www.dgpa.gov.tw/FileConversion": "https://www.dgpa.gov.tw/FileConversion?filename=dgpa/files/202607/f538b1ff-ba60-4c63-9477-10db8e6612d1.csv",
  "the closure-announcement page": "https://www.dgpa.gov.tw/typh/daily/nds.html",
};

test("both probes cover the dgpa.gov.tw calendar CSV, the closure page and the data.gov.tw 14718 resolver", () => {
  for (const [why, url] of Object.entries(DGPA_PROBES)) {
    for (const [name, text] of [
      ["egress-probe.yml", workflow],
      ["gha-egress-probe-host.mjs", hostScript],
    ]) {
      assert.ok(text.includes(url), `${name} must probe ${why} (${url})`);
    }
  }
});

test("the probed CSV URL is the real one the sync would resolve for 2027 (116年…_utf8bom.csv), percent-encoding intact", () => {
  const sample = JSON.parse(
    readFileSync(new URL("../lib/server/officeCalendar/__fixtures__/dataset-14718-metadata-sample.json", import.meta.url), "utf8"),
  );
  const resource = sample.result.distribution.find(
    (d) => d.resourceDescription === "116年中華民國政府行政機關辦公日曆表",
  );
  assert.ok(resource, "the metadata fixture must contain the 116 main file");
  for (const [name, text] of [
    ["egress-probe.yml", workflow],
    ["gha-egress-probe-host.mjs", hostScript],
  ]) {
    assert.ok(text.includes(resource.resourceDownloadUrl), `${name} must probe the exact resolved 116 URL`);
  }
});

test("the dgpa probes are labelled with the issue so the coordinating session can find them in the report", () => {
  assert.match(workflow, /issue #691/);
  assert.match(hostScript, /issue #691/);
  assert.match(workflow, /www\.dgpa\.gov\.tw nds\.html/);
  assert.match(hostScript, /www\.dgpa\.gov\.tw nds\.html/);
});

test("egress-probe.yml stays manual-only", () => {
  const onBlock = /^on:\n((?: {2}.*\n|\n)+)/m.exec(workflow);
  assert.ok(onBlock, "expected a top-level `on:` block");
  const triggers = [...onBlock[1].matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
  assert.deepEqual(triggers, ["workflow_dispatch"]);
});

test("the host probe's job timeout still covers every target at 20s each (the shared #669 arithmetic, re-checked after these three were added)", () => {
  const targetCount = hostScript
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line) && /"https:\/\//.test(line)).length;
  const hostJob = workflow.slice(workflow.indexOf("probe-from-host:"));
  const timeoutMinutes = Number(/timeout-minutes:\s*(\d+)/.exec(hostJob)?.[1]);
  assert.ok(Number.isFinite(timeoutMinutes));
  assert.ok(
    timeoutMinutes * 60 >= targetCount * 20 + 60,
    `probe-from-host timeout-minutes=${timeoutMinutes} can't cover ${targetCount} targets x 20s (+60s slack)`,
  );
});

test("the runner-side Track B step still fits its job timeout with the three extra curls (20s cap each)", () => {
  const curlCount = (workflow.match(/probe_track_b "/g) || []).length;
  const runnerJob = workflow.slice(workflow.indexOf("probe:"), workflow.indexOf("probe-from-host:"));
  const timeoutMinutes = Number(/timeout-minutes:\s*(\d+)/.exec(runnerJob)?.[1]);
  assert.ok(Number.isFinite(timeoutMinutes));
  // Upper bound for the Track B step alone; the other steps have their own (smaller) budgets.
  assert.ok(curlCount * 20 <= timeoutMinutes * 60, `${curlCount} Track B curls x 20s exceed ${timeoutMinutes} min`);
});
