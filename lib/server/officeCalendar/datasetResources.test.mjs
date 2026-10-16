// Issue #691 — choosing the right yearly CSV out of the data.gov.tw 14718
// metadata. The sample is a trimmed copy of the live response (2026-10-16),
// including its awkward parts: `_Google行事曆專用` variants, a 114 correction
// listed AFTER the 115 original, and a different encoding on that correction.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "./testHooks.mjs";

const { resolveCalendarResources, OFFICE_CALENDAR_DATASET_API, gregorianToRoc } = await import("./datasetResources.ts");

const metadata = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL("./__fixtures__/dataset-14718-metadata-sample.json", import.meta.url)), "utf8"),
);

const distributionWith = (...entries) => ({ result: { distribution: entries } });
const entry = (description, url = "https://www.dgpa.gov.tw/FileConversion?filename=dgpa/files/x.csv", encoding = "UTF-8") => ({
  resourceDescription: description,
  resourceDownloadUrl: url,
  resourceCharacterEncoding: encoding,
});

test("the resolver endpoint is the data.gov.tw v2 API for dataset 14718", () => {
  assert.equal(OFFICE_CALENDAR_DATASET_API, "https://data.gov.tw/api/v2/rest/dataset/14718");
});

test("gregorianToRoc: 2026 is ROC 115", () => {
  assert.equal(gregorianToRoc(2026), 115);
  assert.equal(gregorianToRoc(2027), 116);
});

test("picks the main file for this year and next year from the real metadata sample", () => {
  const resources = resolveCalendarResources(metadata, [2026, 2027]);
  assert.deepEqual([...resources.keys()].sort(), [2026, 2027]);

  const y2026 = resources.get(2026);
  assert.equal(y2026.description, "115年中華民國政府行政機關辦公日曆表");
  assert.ok(y2026.url.includes("a52331bd-a189-466b-b0f0-cae3062bbf74"));

  const y2027 = resources.get(2027);
  assert.equal(y2027.description, "116年中華民國政府行政機關辦公日曆表");
  assert.ok(y2027.url.includes("f538b1ff-ba60-4c63-9477-10db8e6612d1"));
});

test("never picks a _Google行事曆專用 variant (it lists only the days off, not the working days)", () => {
  for (const year of [2025, 2026, 2027]) {
    const resource = resolveCalendarResources(metadata, [year]).get(year);
    assert.ok(resource, String(year));
    assert.ok(!resource.description.includes("Google"), resource.description);
  }
});

test("for 2025 the October-2025 correction (1141020更新, Big5) beats the original even though it is listed after the 115 entry", () => {
  const resource = resolveCalendarResources(metadata, [2025]).get(2025);
  assert.equal(resource.description, "114年中華民國政府行政機關辦公日曆表(1141020更新)");
  assert.ok(resource.url.includes("b84cb88a-803c-4621-a843-d637b2775615"));
  assert.equal(resource.encodingHint, "BIG5");
});

test("a higher update stamp wins even when the older entry is listed later", () => {
  const meta = distributionWith(
    entry("115年中華民國政府行政機關辦公日曆表(1150301更新)", "https://www.dgpa.gov.tw/FileConversion?filename=new.csv"),
    entry("115年中華民國政府行政機關辦公日曆表", "https://www.dgpa.gov.tw/FileConversion?filename=old.csv"),
  );
  assert.ok(resolveCalendarResources(meta, [2026]).get(2026).url.endsWith("new.csv"));
});

test("with equal stamps (or none) the entry listed last wins", () => {
  const meta = distributionWith(
    entry("115年中華民國政府行政機關辦公日曆表", "https://www.dgpa.gov.tw/FileConversion?filename=first.csv"),
    entry("115年中華民國政府行政機關辦公日曆表", "https://www.dgpa.gov.tw/FileConversion?filename=second.csv"),
  );
  assert.ok(resolveCalendarResources(meta, [2026]).get(2026).url.endsWith("second.csv"));
});

test("a year the metadata does not list is simply absent (next year before it is published)", () => {
  const meta = distributionWith(entry("115年中華民國政府行政機關辦公日曆表"));
  const resources = resolveCalendarResources(meta, [2026, 2027]);
  assert.ok(resources.has(2026));
  assert.ok(!resources.has(2027));
});

test("only the requested years are returned", () => {
  const resources = resolveCalendarResources(metadata, [2026]);
  assert.deepEqual([...resources.keys()], [2026]);
});

test("a resource URL outside www.dgpa.gov.tw (or not https) is ignored — the file URL comes from a remote JSON, so it is allow-listed", () => {
  const meta = distributionWith(
    entry("115年中華民國政府行政機關辦公日曆表", "https://evil.example.com/115.csv"),
    entry("115年中華民國政府行政機關辦公日曆表", "http://www.dgpa.gov.tw/FileConversion?filename=plain-http.csv"),
    entry("115年中華民國政府行政機關辦公日曆表", "not a url"),
  );
  assert.equal(resolveCalendarResources(meta, [2026]).size, 0);

  const ok = distributionWith(
    entry("115年中華民國政府行政機關辦公日曆表", "https://evil.example.com/115.csv"),
    entry("115年中華民國政府行政機關辦公日曆表", "https://www.dgpa.gov.tw/FileConversion?filename=good.csv"),
  );
  assert.ok(resolveCalendarResources(ok, [2026]).get(2026).url.endsWith("good.csv"));
});

test("metadata that is not the expected shape throws instead of silently syncing nothing", () => {
  assert.throws(() => resolveCalendarResources(null, [2026]), /distribution/);
  assert.throws(() => resolveCalendarResources({}, [2026]), /distribution/);
  assert.throws(() => resolveCalendarResources({ result: { distribution: "nope" } }, [2026]), /distribution/);
  assert.throws(() => resolveCalendarResources("<html>blocked</html>", [2026]), /distribution/);
});

test("entries that are not main calendar files are ignored (other datasets' resources, stray notes, empty descriptions)", () => {
  const meta = distributionWith(
    entry("政府行政機關辦公日曆表說明文件"),
    entry(""),
    entry("115年辦公日曆表"),
    null,
    entry("115年中華民國政府行政機關辦公日曆表"),
  );
  assert.equal(resolveCalendarResources(meta, [2026]).get(2026).description, "115年中華民國政府行政機關辦公日曆表");
});
