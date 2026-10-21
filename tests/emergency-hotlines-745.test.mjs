import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Issue #745（合併兩張重複的 1953 反霸凌專線卡片並排第 3 位）。
//
// 工具頁（zh 與 [locale] 兩份）都是直接以 data/government-hotlines.json 的陣列順序
// 渲染卡片（EmergencyHotlinesContent 的預設視圖沒有自己的排序），多語版共用同一份
// 資料，所以資料檔順序就是所有語系的預設順序。這裡只驗資料檔的外部行為。

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hotlines = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "data", "government-hotlines.json"), "utf8"));
const numbers = hotlines.map((r) => r.number);

// 改版前（49 筆）的資料檔順序快照。
const ORDER_BEFORE = [
  "110", "119", "112", "113", "118", "165", "168", "166", "167", "104", "105", "106", "108",
  "1999", "1922", "1925", "1968", "1980", "1995", "1950", "1955", "1966", "1957", "1910", "1911",
  "1908", "1988", "1985", "1991", "1920", "1902", "1905", "0800-024-111", "0800-088-888",
  "0800-286-586", "0800-285-000", "0800-030-598", "0800-011-765", "0800-006-006", "0800-000-321",
  "0800-777-888", "0800-005-599", "0800-002-117", "0800-057-006", "0800-088-590", "1953",
  "0800-770-885", "0800-636-363", "0800-531-531",
];

// 與 EmergencyHotlinesContent 關鍵字搜尋比對的欄位一致。
function search(q) {
  const needle = q.trim().toLowerCase();
  return hotlines.filter((item) =>
    [item.number, item.name, item.agency, item.description || "", item.category || "", item.alternative_number || ""].some(
      (field) => field.toLowerCase().includes(needle),
    ),
  );
}

test("改前快照本身為 49 筆（防止快照被誤改）", () => {
  assert.equal(ORDER_BEFORE.length, 49);
});

test("1953 排第 3 位，110、119 在其前", () => {
  assert.deepEqual(numbers.slice(0, 3), ["110", "119", "1953"]);
});

test("號碼不重複，且總筆數為 48", () => {
  assert.equal(new Set(numbers).size, numbers.length);
  assert.equal(hotlines.length, 48);
});

test("舊長碼 0800-088-590 不再單獨成卡，只作為 1953 的備用號碼", () => {
  assert.ok(!numbers.includes("0800-088-590"));
  const card = hotlines.find((r) => r.number === "1953");
  assert.equal(card.alternative_number, "0800-088-590");
  assert.equal(card.name, "教育部反霸凌專線");
  assert.equal(card.agency, "教育部");
  assert.equal(card.category, "教育校園");
  assert.equal(card.billing, "免付費");
  assert.equal(card.service_hours, "24小時");
  assert.equal(card.geographic_scope, "全國");
  assert.ok(card.description.includes("1953") && card.description.includes("霸凌"));
});

test("其他專線的相對順序與改前完全相同", () => {
  const expected = ORDER_BEFORE.filter((n) => n !== "0800-088-590" && n !== "1953");
  assert.deepEqual(
    numbers.filter((n) => n !== "1953"),
    expected,
  );
});

test("搜尋 1953 與 0800-088-590 都只找到同一張卡", () => {
  assert.deepEqual(search("1953").map((r) => r.number), ["1953"]);
  assert.deepEqual(search("0800-088-590").map((r) => r.number), ["1953"]);
});

test("搜尋類別「教育校園」仍列出它", () => {
  assert.ok(search("教育校園").some((r) => r.number === "1953"));
});

test("CSV 副本與 JSON 一致：只有一列 1953、第 3 列、無舊長碼獨立列", () => {
  const csv = fs.readFileSync(path.join(ROOT_DIR, "data", "taiwan-hotlines.csv"), "utf8").split(/\r?\n/).filter(Boolean);
  const rows = csv.slice(1).map((l) => l.split(",")[0]);
  assert.equal(rows.length, 48);
  assert.deepEqual(rows.slice(0, 3), ["110", "119", "1953"]);
  assert.ok(!rows.includes("0800-088-590"));
  assert.equal(rows.filter((n) => n === "1953").length, 1);
});
