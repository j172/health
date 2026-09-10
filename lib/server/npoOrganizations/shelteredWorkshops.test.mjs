import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inferCityFromName } from "../../../scripts/ingest-sheltered-workshops.mjs";
import { normalizeOrgName } from "./npoUtils.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, "../../../data/sheltered-workshops.json");

test("Sheltered Workshops: dataset exists and has valid clean URLs", () => {
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  const list = JSON.parse(raw);
  assert.ok(list.length >= 60, "Must contain at least 60 sheltered workshops");

  for (const item of list) {
    assert.ok(item.name, "Every entry must have a name");
    if (item.storeUrl) {
      assert.ok(
        !item.storeUrl.includes("l.facebook.com/l.php"),
        `storeUrl must not contain raw Facebook redirect: ${item.storeUrl}`,
      );
      assert.ok(
        item.storeUrl.startsWith("http://") || item.storeUrl.startsWith("https://"),
        `storeUrl must be valid http(s): ${item.storeUrl}`,
      );
    }
  }
});

test("Sheltered Workshops: inferCityFromName correctly extracts Taiwan cities", () => {
  assert.equal(inferCityFromName("新北市喜憨兒庇護工場"), "新北市");
  assert.equal(inferCityFromName("財團法人台北市自閉兒社會福利基金會"), "臺北市");
  assert.equal(inferCityFromName("財團法人桃園市私立觀音愛心家園"), "桃園市");
  assert.equal(inferCityFromName("社團法人臺中市蓮心自強服務協會"), "臺中市");
  assert.equal(inferCityFromName("財團法人彰化縣私立慈生仁愛院"), "彰化縣");
  assert.equal(inferCityFromName("社團法人雲林縣聲暉協進會"), "雲林縣");
  assert.equal(inferCityFromName("臺南市心智障礙關顧協會"), "臺南市");
  assert.equal(inferCityFromName("社團法人屏東縣向陽啟能協會"), "屏東縣");
  assert.equal(inferCityFromName("花蓮黎明身心障礙者庇護工場"), "花蓮縣");
  assert.equal(inferCityFromName("社團法人澎湖縣慢飛天使服務協會"), "澎湖縣");
});

test("Sheltered Workshops: normalizeOrgName matches sheltered workshop variations", () => {
  assert.equal(
    normalizeOrgName("財團法人中華民國唐氏症基金會（愛不囉嗦）"),
    "唐氏症基金會",
  );
  assert.equal(
    normalizeOrgName("財團法人台北市自閉兒社會福利基金會附設愛肯樂活工場"),
    "自閉兒社會福利基金會附設愛肯樂活工場",
  );
  assert.equal(
    normalizeOrgName("財團法人台灣省私立香園紀念教養院"),
    "私立香園紀念教養院",
  );
});
