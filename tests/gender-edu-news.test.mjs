import test from "node:test";
import assert from "node:assert/strict";
import "./helpers/register-ts-alias-hooks.mjs";

const {
  isAdministrativeMemo,
  parseGenderEduDate,
  parseGenderEduHtml,
  GENDER_EDU_URL,
  GENDER_EDU_SOURCE_NAME,
  GENDER_EDU_FEED_CODE,
} = await import("../lib/server/news/sources/genderEdu.ts");

const {
  SOURCE_CATEGORIES,
  isFactCheckSource,
  isGovSource,
  getFactCheckNotice,
} = await import("../lib/server/news/sourceCategories.ts");

const { getSourceLabel, hasSourceLabel } = await import("../lib/server/news/sourceLabels.ts");

const SAMPLE_GENDER_EDU_HTML = `
<!DOCTYPE html>
<html>
<head><title>新聞稿及資訊澄清 - 教育部性別平等教育全球資訊網</title></head>
<body>
  <div class="content">
    <table class="table">
      <thead>
        <tr><th>發布日期</th><th>標題</th><th>單位</th></tr>
      </thead>
      <tbody>
        <!-- Clarification item (keep) -->
        <tr>
          <td>115/10/24</td>
          <td>
            <a href="/web/index.php/m1/m1_03_01_detail?sid=1089" title="網路流傳國小教科書不實性平教材內容之澄清說明">
              網路流傳國小教科書不實性平教材內容之澄清說明
            </a>
          </td>
          <td>學生事務及特殊教育司</td>
        </tr>
        <!-- Administrative memo item (filter out) -->
        <tr>
          <td>115/10/20</td>
          <td>
            <a href="/web/index.php/m1/m1_03_01_detail?sid=1088" title="115學年度中央性別平等教育委員會委員遴選作業說明">
              115學年度中央性別平等教育委員會委員遴選作業說明
            </a>
          </td>
          <td>秘書處</td>
        </tr>
        <!-- Debunking item (keep) -->
        <tr>
          <td>2026-10-18</td>
          <td>
            <a href="https://www.gender.edu.tw/web/index.php/m1/m1_03_01_detail?sid=1087">
              【闢謠】通訊軟體散布校園性騷擾防制指引不實資訊說明
            </a>
          </td>
          <td>學生事務及特殊教育司</td>
        </tr>
        <!-- Administrative training camp (filter out) -->
        <tr>
          <td>115.10.15</td>
          <td>
            <a href="/web/index.php/m1/m1_03_01_detail?sid=1086">
              大專校院性平行政人員培訓研習營報名簡章
            </a>
          </td>
          <td>教育部</td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>
`;

test("genderEdu 常數與來源設定", () => {
  assert.equal(GENDER_EDU_SOURCE_NAME, "gender_edu");
  assert.equal(GENDER_EDU_FEED_CODE, "gender_edu_clarify");
  assert.equal(GENDER_EDU_URL, "https://www.gender.edu.tw/web/index.php/m1/m1_03_index");
});

test("isAdministrativeMemo: 正確識別並過濾公務行政公文，保留查核澄清文章", () => {
  // Administrative memos -> true (filtered)
  assert.equal(isAdministrativeMemo("115學年度性別平等教育推動委員會委員遴選作業簡章"), true);
  assert.equal(isAdministrativeMemo("大專校院性平行政人員培訓研習營報名"), true);
  assert.equal(isAdministrativeMemo("專案計畫徵件簡章及申請說明"), true);
  assert.equal(isAdministrativeMemo("公文函知：各級學校性平委員名單報部備查"), true);

  // Debunking and clarification -> false (kept)
  assert.equal(isAdministrativeMemo("網路流傳國小教科書不實性平教材內容之澄清說明"), false);
  assert.equal(isAdministrativeMemo("【闢謠】通訊軟體散布校園性騷擾防制指引不實資訊說明"), false);
  assert.equal(isAdministrativeMemo("針對社群平台轉傳性平課綱不實假訊息之澄清說明"), false);
  assert.equal(isAdministrativeMemo("性別平等教育法修法重點與防制指引宣導說明"), false);
});

test("parseGenderEduDate: 支援西元年月日與民國年 (ROC) 格式解析", () => {
  // Gregorian
  const d1 = parseGenderEduDate("2026-10-24");
  assert.ok(d1);
  assert.equal(d1.getUTCFullYear(), 2026);
  assert.equal(d1.getUTCMonth(), 9); // Month is 0-indexed: 9 = October

  const d2 = parseGenderEduDate("2026/05/10 14:00");
  assert.ok(d2);
  assert.equal(d2.getUTCFullYear(), 2026);

  // ROC (115 + 1911 = 2026)
  const d3 = parseGenderEduDate("115/10/24");
  assert.ok(d3);
  assert.equal(d3.getUTCFullYear(), 2026);

  const d4 = parseGenderEduDate("115.10.15");
  assert.ok(d4);
  assert.equal(d4.getUTCFullYear(), 2026);

  // Invalid date
  assert.equal(parseGenderEduDate(""), null);
  assert.equal(parseGenderEduDate("invalid-date-string"), null);
});

test("parseGenderEduHtml: 正確解析 HTML 列表，過濾行政公文並帶入官方澄清標記", () => {
  const items = parseGenderEduHtml(SAMPLE_GENDER_EDU_HTML);

  // Out of 4 items in sample, 2 are clarifications (kept) and 2 are memos (filtered)
  assert.equal(items.length, 2);

  const first = items[0];
  assert.equal(first.sourceName, "gender_edu");
  assert.equal(first.feedCode, "gender_edu_clarify");
  assert.equal(first.displayType, "gov_clarification");
  assert.equal(first.categoryRaw, "factcheck");
  assert.match(first.title, /教科書不實性平教材內容之澄清說明/);
  assert.match(first.canonicalUrl, /^https:\/\/www\.gender\.edu\.tw\/web\/index\.php\/m1\/m1_03_01_detail\?sid=1089/);
  assert.equal(first.deptName, "教育部性別平等教育全球資訊網");

  const second = items[1];
  assert.match(second.title, /闢謠.*校園性騷擾防制指引/);
  assert.equal(second.sourceName, "gender_edu");
});

test("SOURCE_CATEGORIES 與 sourceLabels: 註冊教育部性平網為 gov 與 factcheck 雙重來源", () => {
  assert.equal(hasSourceLabel("gender_edu"), true);
  assert.equal(getSourceLabel("gender_edu"), "教育部性平網");

  const govCat = SOURCE_CATEGORIES.find((c) => c.key === "gov");
  assert.ok(govCat);
  assert.ok(govCat.sources.some((s) => s.sourceName === "gender_edu" && s.label === "教育部性平網"));

  const factCat = SOURCE_CATEGORIES.find((c) => c.key === "factcheck");
  assert.ok(factCat);
  assert.ok(factCat.sources.some((s) => s.sourceName === "gender_edu" && s.label === "教育部性平網"));

  assert.equal(isFactCheckSource("gender_edu"), true);
  assert.equal(isGovSource("gender_edu"), true);

  const notice = getFactCheckNotice("gender_edu", "教育部性平網");
  assert.ok(notice);
  assert.match(notice, /教育部官方澄清/);
});
