import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT_DIR = path.resolve(__dirname, "..");
const REPO_ROOT_URL = new URL("../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT_URL.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const {
  CONTEXTUAL_PARTNERS,
  buildContextualPartnerUrl,
} = await import("../lib/constants/contextualPartners.ts");

const {
  CIVIC_PARTNER_LINKS,
  buildFooterModel,
} = await import("../lib/server/tools/navModel.ts");

test("moe-ece & sfaa-crc: CONTEXTUAL_PARTNERS configs exist with valid attributes", () => {
  const moe = CONTEXTUAL_PARTNERS["moe-ece"];
  assert.ok(moe, "moe-ece must be registered in CONTEXTUAL_PARTNERS");
  assert.equal(moe.id, "moe-ece");
  assert.equal(moe.name, "教育部幼兒園裁罰專區");
  assert.equal(moe.baseUrl, "https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx");
  assert.equal(moe.icon, "🏫");
  assert.equal(moe.badge, "幼教安全防護");
  assert.ok(moe.defaultTitle.includes("幼兒園立案與裁罰安全查核"));
  assert.ok(moe.defaultDescription.includes("教育部專區查核歷年裁罰紀錄"));
  assert.equal(moe.defaultActionText, "查核幼兒園裁罰名冊");

  const sfaa = CONTEXTUAL_PARTNERS["sfaa-crc"];
  assert.ok(sfaa, "sfaa-crc must be registered in CONTEXTUAL_PARTNERS");
  assert.equal(sfaa.id, "sfaa-crc");
  assert.equal(sfaa.name, "衛福部兒少法裁罰專區");
  assert.equal(sfaa.baseUrl, "https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction");
  assert.equal(sfaa.icon, "🚸");
  assert.equal(sfaa.badge, "兒少權益防護");
  assert.ok(sfaa.defaultTitle.includes("兒少身心防護與違規裁罰查核"));
  assert.ok(sfaa.defaultDescription.includes("衛福部社會及家庭署公告專區"));
  assert.equal(sfaa.defaultActionText, "查核兒少法裁罰名單");
});

test("moe-ece & sfaa-crc: buildContextualPartnerUrl generates correct UTM parameters", () => {
  for (const partnerId of ["moe-ece", "sfaa-crc"]) {
    const config = CONTEXTUAL_PARTNERS[partnerId];
    const url = buildContextualPartnerUrl(config.baseUrl);
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("utm_source"), "health.j172.tw");
    assert.equal(parsed.searchParams.get("utm_medium"), "contextual_banner");
    assert.equal(parsed.searchParams.get("utm_campaign"), "civic_partner");
    // Ensure transient params like AspxAutoDetectCookieSupport are never present
    assert.ok(!parsed.searchParams.has("AspxAutoDetectCookieSupport"));
  }
});

test("moe-ece & sfaa-crc: CivicPartnersSection.tsx includes both partners with exact order", () => {
  const sectionContent = fs.readFileSync(
    path.join(REPO_ROOT_DIR, "components", "Common", "CivicPartnersSection.tsx"),
    "utf-8"
  );

  assert.ok(sectionContent.includes('id: "moe-ece"'), "CivicPartnersSection must include moe-ece");
  assert.ok(sectionContent.includes('name: "教育部幼兒園裁罰專區"'));
  assert.ok(sectionContent.includes('url: "https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx"'));
  assert.ok(sectionContent.includes('badge: "幼教安全"'));

  assert.ok(sectionContent.includes('id: "sfaa-crc"'), "CivicPartnersSection must include sfaa-crc");
  assert.ok(sectionContent.includes('name: "衛福部兒少法裁罰專區"'));
  assert.ok(sectionContent.includes('url: "https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction"'));
  assert.ok(sectionContent.includes('badge: "兒少安全"'));

  const mohwIndex = sectionContent.indexOf('id: "mohw-vio"');
  const moeIndex = sectionContent.indexOf('id: "moe-ece"');
  const sfaaIndex = sectionContent.indexOf('id: "sfaa-crc"');
  const councilIndex = sectionContent.indexOf('id: "council2026"');

  assert.ok(mohwIndex !== -1 && moeIndex !== -1 && sfaaIndex !== -1 && councilIndex !== -1);
  assert.ok(
    mohwIndex < moeIndex && moeIndex < sfaaIndex && sfaaIndex < councilIndex,
    "Ordering must be mohw-vio -> moe-ece -> sfaa-crc -> council2026"
  );
});

test("moe-ece & sfaa-crc: navModel.ts CIVIC_PARTNER_LINKS and buildFooterModel integration", () => {
  assert.equal(CIVIC_PARTNER_LINKS.length, 11, "CIVIC_PARTNER_LINKS should have exactly 11 links");

  const moeLink = CIVIC_PARTNER_LINKS.find(
    (l) => l.href === "https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx"
  );
  assert.ok(moeLink, "moe-ece link must be present in CIVIC_PARTNER_LINKS");
  assert.equal(moeLink.label, "教育部幼兒園裁罰專區");

  const sfaaLink = CIVIC_PARTNER_LINKS.find(
    (l) => l.href === "https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction"
  );
  assert.ok(sfaaLink, "sfaa-crc link must be present in CIVIC_PARTNER_LINKS");
  assert.equal(sfaaLink.label, "衛福部兒少法裁罰專區");

  // Verify order in CIVIC_PARTNER_LINKS
  const mohwIdx = CIVIC_PARTNER_LINKS.findIndex((l) => l.href.includes("ma.mohw.gov.tw"));
  const moeIdx = CIVIC_PARTNER_LINKS.findIndex((l) => l.href.includes("ap.ece.moe.edu.tw"));
  const sfaaIdx = CIVIC_PARTNER_LINKS.findIndex((l) => l.href.includes("crc.sfaa.gov.tw"));
  const councilIdx = CIVIC_PARTNER_LINKS.findIndex((l) => l.href.includes("council2026"));

  assert.ok(mohwIdx !== -1 && moeIdx !== -1 && sfaaIdx !== -1 && councilIdx !== -1);
  assert.ok(
    mohwIdx < moeIdx && moeIdx < sfaaIdx && sfaaIdx < councilIdx,
    "CIVIC_PARTNER_LINKS ordering must be mohw-vio -> moe-ece -> sfaa-crc -> council2026"
  );

  // Test buildFooterModel() output
  const footerModel = buildFooterModel();
  const civicBlock = footerModel.find((b) => b.id === "civic-partners");
  assert.ok(civicBlock);
  assert.equal(civicBlock.links.length, 11);

  const moeFooterLink = civicBlock.links.find((l) => l.href.includes("ap.ece.moe.edu.tw"));
  assert.ok(moeFooterLink);
  const moeUrl = new URL(moeFooterLink.href);
  assert.equal(moeUrl.searchParams.get("utm_source"), "health.j172.tw");
  assert.equal(moeUrl.searchParams.get("utm_medium"), "civic_partner");
  assert.equal(moeUrl.searchParams.get("utm_campaign"), "civic_alliance");
  assert.equal(moeUrl.searchParams.get("utm_content"), "footer");

  const sfaaFooterLink = civicBlock.links.find((l) => l.href.includes("crc.sfaa.gov.tw"));
  assert.ok(sfaaFooterLink);
  const sfaaUrl = new URL(sfaaFooterLink.href);
  assert.equal(sfaaUrl.searchParams.get("utm_source"), "health.j172.tw");
  assert.equal(sfaaUrl.searchParams.get("utm_medium"), "civic_partner");
  assert.equal(sfaaUrl.searchParams.get("utm_campaign"), "civic_alliance");
  assert.equal(sfaaUrl.searchParams.get("utm_content"), "footer");
});

test("moe-ece & sfaa-crc: SiteFooter.tsx maps hostnames to correct i18n keys", () => {
  const footerContent = fs.readFileSync(
    path.join(REPO_ROOT_DIR, "components", "News", "SiteFooter.tsx"),
    "utf-8"
  );

  assert.ok(
    footerContent.includes('"ap.ece.moe.edu.tw": "footer.moeEce"'),
    "SiteFooter must map ap.ece.moe.edu.tw to footer.moeEce"
  );
  assert.ok(
    footerContent.includes('"crc.sfaa.gov.tw": "footer.sfaaCrc"'),
    "SiteFooter must map crc.sfaa.gov.tw to footer.sfaaCrc"
  );
});

test("moe-ece & sfaa-crc: all 4 locales provide non-empty translations without ↗", () => {
  const LOCALES = ["zh-TW", "en", "ja", "ko"];
  const EXPECTED = {
    "zh-TW": {
      moeEce: "教育部幼兒園裁罰專區",
      sfaaCrc: "衛福部兒少法裁罰專區",
    },
    en: {
      moeEce: "MOE Preschool Violations Database",
      sfaaCrc: "MOHW Child Protection Sanctions",
    },
    ja: {
      moeEce: "教育部幼稚園処分情報検索",
      sfaaCrc: "衛生福利部児童青少年保護法処分公報",
    },
    ko: {
      moeEce: "교육부 유치원 행정처분 조회",
      sfaaCrc: "위생복지부 아동복지법 행정처분 공보",
    },
  };

  for (const locale of LOCALES) {
    const filePath = path.join(REPO_ROOT_DIR, "locales", `${locale}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    assert.ok(data.footer, `${locale}.json missing footer object`);

    assert.equal(data.footer.moeEce, EXPECTED[locale].moeEce, `${locale} footer.moeEce translation mismatch`);
    assert.equal(data.footer.sfaaCrc, EXPECTED[locale].sfaaCrc, `${locale} footer.sfaaCrc translation mismatch`);

    assert.ok(!data.footer.moeEce.includes("↗"), `${locale} footer.moeEce must not include ↗`);
    assert.ok(!data.footer.sfaaCrc.includes("↗"), `${locale} footer.sfaaCrc must not include ↗`);
  }
});

test("moe-ece: kindergartens tool page mounts ContextualPartnerCard for moe-ece", () => {
  const pageContent = fs.readFileSync(
    path.join(REPO_ROOT_DIR, "app", "(zh)", "tools", "kindergartens", "page.tsx"),
    "utf-8"
  );

  assert.ok(
    pageContent.includes('partnerId="moe-ece"'),
    "kindergartens page must mount ContextualPartnerCard with partnerId='moe-ece'"
  );
  assert.ok(
    pageContent.includes('contextTitle="幼兒園立案與裁罰安全防護線"'),
    "kindergartens page must provide contextual title"
  );
  assert.ok(
    pageContent.includes("教育部幼兒園裁罰專區"),
    "kindergartens page must mention 教育部幼兒園裁罰專區 in description"
  );
});
