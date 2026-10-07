import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCategoryHtml, CATEGORIES } from "../scripts/sync-medical-violators.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

test("medical-violators seed data is well-formed with verified records", () => {
  const seedPath = path.join(REPO_ROOT, "data", "medical-violators-seed.json");
  assert.ok(fs.existsSync(seedPath), "medical-violators-seed.json must exist");

  const content = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
  assert.ok(content.metadata, "Metadata must exist");
  assert.equal(content.metadata.source, "衛生福利部 醫事人員性別事件資訊專區");
  assert.ok(content.metadata.lastSyncedAt);
  assert.ok(Array.isArray(content.data));
  assert.ok(content.data.length >= 20, `Expected at least 20 records, got ${content.data.length}`);

  for (const item of content.data) {
    assert.ok(item.id, "Record must have id");
    assert.ok(item.name, "Record must have name");
    assert.ok(item.category, "Record must have category");
    assert.ok(["執業中", "歇業", "已廢證"].includes(item.status), `Invalid status: ${item.status}`);
    assert.ok(item.licenseMasked, "Record must have licenseMasked");
    assert.ok(Array.isArray(item.links), "Links must be an array");
    for (const link of item.links) {
      assert.ok(link.url.startsWith("https://") || link.url.startsWith("http://"), `Invalid link URL: ${link.url}`);
      assert.ok(["judgment", "disciplinary", "other"].includes(link.type));
    }
  }
});

test("parseCategoryHtml parses 5-column physician data correctly", () => {
  const physicianCat = CATEGORIES.find((c) => c.code === "A");
  const sampleHtml = `
    <table>
      <thead>
        <tr><th colspan="3">醫事人員</th><th rowspan="2">性別事件相關案件資訊</th><th rowspan="2">醫事人員證書字號</th></tr>
        <tr><th>姓名</th><th>專科別</th><th>執業縣市</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>張測試</td>
          <td>婦產科</td>
          <td>臺北市</td>
          <td>
            <strong><a href="https://judgment.judicial.gov.tw/FJUD/data.aspx?id=123" target="_blank">裁判1</a></strong>
          </td>
          <td>醫***999</td>
        </tr>
      </tbody>
    </table>
  `;

  const parsed = parseCategoryHtml(sampleHtml, physicianCat);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, "張測試");
  assert.equal(parsed[0].specialty, "婦產科");
  assert.equal(parsed[0].city, "臺北市");
  assert.equal(parsed[0].status, "執業中");
  assert.equal(parsed[0].licenseMasked, "醫***999");
  assert.equal(parsed[0].links.length, 1);
  assert.equal(parsed[0].links[0].type, "judgment");
});

test("catalog.ts registers medical-violators with INDEXABLE_SLUGS and care-facility group", () => {
  const catalogContent = fs.readFileSync(path.join(REPO_ROOT, "lib", "server", "tools", "catalog.ts"), "utf-8");
  assert.ok(catalogContent.includes('slug: "medical-violators"'), "catalog.ts must contain medical-violators slug");
  assert.ok(catalogContent.includes('group: "care-facility"'), "medical-violators must belong to care-facility group");
  assert.ok(catalogContent.includes('"medical-violators",'), "INDEXABLE_SLUGS must contain medical-violators");
});

test("SiteFooter and CivicPartnersSection include mohw-vio partner and URLs", () => {
  const footerContent = fs.readFileSync(path.join(REPO_ROOT, "components", "News", "SiteFooter.tsx"), "utf-8");
  assert.ok(
    footerContent.includes("https://ma.mohw.gov.tw/Accessibility/VIOSearch/MASearchVIO"),
    "SiteFooter must include MOHW VIO url"
  );
  assert.ok(footerContent.includes("footer.mohwVio"), "SiteFooter must use footer.mohwVio i18n key");

  const civicContent = fs.readFileSync(path.join(REPO_ROOT, "components", "Common", "CivicPartnersSection.tsx"), "utf-8");
  assert.ok(civicContent.includes('id: "mohw-vio"'), "CivicPartnersSection must include mohw-vio partner");
  assert.ok(civicContent.includes("衛福部醫事性平專區"), "CivicPartnersSection must include card title");
});

test("clinics page contains ContextualPartnerCard for mohw-vio", () => {
  const clinicsContent = fs.readFileSync(path.join(REPO_ROOT, "app", "tools", "clinics", "page.tsx"), "utf-8");
  assert.ok(clinicsContent.includes('partnerId="mohw-vio"'), "clinics page must include mohw-vio partner card");
  assert.ok(clinicsContent.includes("ContextualPartnerCard"), "clinics page must import ContextualPartnerCard");
});

test("all locale files contain footer.mohwVio translations", () => {
  const locales = ["zh-TW", "en", "ja", "ko"];
  for (const loc of locales) {
    const filePath = path.join(REPO_ROOT, "locales", `${loc}.json`);
    const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    assert.ok(json.footer, `${loc}.json must have footer section`);
    assert.ok(json.footer.mohwVio, `${loc}.json must have footer.mohwVio`);
    assert.ok(json.catalog?.["medical-violators"] || loc === "zh-TW", `${loc}.json must have medical-violators in catalog`);
  }
});
