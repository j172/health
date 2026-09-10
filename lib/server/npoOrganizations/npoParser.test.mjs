import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOrgName,
  cleanWebsiteUrl,
  extractNpoDetailFields,
} from "./npoUtils.ts";
import { parseListPage } from "../../../scripts/ingest-npo-organizations.mjs";

test("NPO Parser: normalizeOrgName removes legal forms and regional prefixes", () => {
  assert.equal(
    normalizeOrgName("社團法人高雄市高大居家照護關懷協會"),
    "高大居家照護關懷協會",
  );
  assert.equal(
    normalizeOrgName("財團法人電路板環境公益基金會"),
    "電路板環境公益基金會",
  );
  assert.equal(
    normalizeOrgName("社團法人中華民國唐氏症基金會"),
    "唐氏症基金會",
  );
  assert.equal(
    normalizeOrgName("社團法人台灣雪山婦幼關懷協會"),
    "雪山婦幼關懷協會",
  );
  assert.equal(
    normalizeOrgName("  財團法人（公辦）勵馨社會福利事業基金會  "),
    "勵馨社會福利事業基金會",
  );
});

test("NPO Parser: cleanWebsiteUrl filters invalid websites and normalizes schemes", () => {
  assert.equal(cleanWebsiteUrl("無"), null);
  assert.equal(cleanWebsiteUrl("暫無網站"), null);
  assert.equal(cleanWebsiteUrl("同上"), null);
  assert.equal(cleanWebsiteUrl("#"), null);
  assert.equal(cleanWebsiteUrl(""), null);
  assert.equal(cleanWebsiteUrl(null), null);
  assert.equal(cleanWebsiteUrl("javascript:void(0)"), null);

  assert.equal(
    cleanWebsiteUrl("https://www.gaodahome.org/"),
    "https://www.gaodahome.org/",
  );
  assert.equal(
    cleanWebsiteUrl("http://example.org/about"),
    "http://example.org/about",
  );
  assert.equal(
    cleanWebsiteUrl("www.worldvision.org.tw"),
    "https://www.worldvision.org.tw/",
  );
});

test("NPO Parser: extractNpoDetailFields parses structured NPO detail page", () => {
  const sampleDetailHtml = `
    <html>
      <head><title>機構資訊</title></head>
      <body>
        <div class="title">社團法人高雄市高大居家照護關懷協會</div>
        <table>
          <tr><td>機構代碼：7852</td></tr>
          <tr><td>機構名稱：社團法人高雄市高大居家照護關懷協會</td></tr>
          <tr><td>聯絡電話：0966444379</td></tr>
          <tr><td>網址：https://www.gaodahome.org/</td></tr>
          <tr><td>地址：811高雄市楠梓區大學三十街25號1樓</td></tr>
          <tr><td>機構屬性：老人福利</td></tr>
          <tr><td>成立主旨：推廣區域與偏鄉在宅醫療照顧</td></tr>
        </table>
      </body>
    </html>
  `;

  const parsed = extractNpoDetailFields(sampleDetailHtml, "7852");
  assert.equal(parsed.orgid, "7852");
  assert.equal(parsed.name, "社團法人高雄市高大居家照護關懷協會");
  assert.equal(parsed.phone, "0966444379");
  assert.equal(parsed.website, "https://www.gaodahome.org/");
  assert.equal(parsed.address, "811高雄市楠梓區大學三十街25號1樓");
  assert.equal(parsed.city, "高雄市");
  assert.equal(parsed.orgAttribute, "老人福利");
  assert.equal(parsed.purpose, "推廣區域與偏鄉在宅醫療照顧");
});

test("NPO Parser: parseListPage extracts items and pagination", () => {
  const sampleListHtml = `
    <html>
      <body>
        <table>
          <tr onclick="javascript:location.href='orgnpointroduction.aspx?tid=200&orgid=7852' ">
            <td data-th="機構代碼">7852</td>
            <td data-th="機構屬性">老人福利</td>
            <td data-th="非營利組織名稱">社團法人高雄市高大居家照護關懷協會</td>
            <td data-th="服務地區">高雄市</td>
          </tr>
          <tr onclick="javascript:location.href='orgnpointroduction.aspx?tid=200&orgid=7851' ">
            <td data-th="機構代碼">7851</td>
            <td data-th="機構屬性">環境保護</td>
            <td data-th="非營利組織名稱">財團法人電路板環境公益基金會</td>
            <td data-th="服務地區">全國性</td>
          </tr>
        </table>
        <a href="npolist.aspx?nowPage=457&tid=146">最後一頁</a>
      </body>
    </html>
  `;

  const result = parseListPage(sampleListHtml);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].orgid, "7852");
  assert.equal(result.items[0].orgAttribute, "老人福利");
  assert.equal(result.items[0].name, "社團法人高雄市高大居家照護關懷協會");
  assert.equal(result.items[0].serviceArea, "高雄市");
  assert.equal(result.totalPages, 457);
});
