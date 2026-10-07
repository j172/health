import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const { CONTEXTUAL_PARTNERS, buildContextualPartnerUrl } = await import(
  "../lib/constants/contextualPartners.ts"
);

test("sports-coach: CONTEXTUAL_PARTNERS config exists with valid attributes", () => {
  const coach = CONTEXTUAL_PARTNERS["sports-coach"];
  assert.ok(coach, "sports-coach must be registered in CONTEXTUAL_PARTNERS");
  assert.equal(coach.id, "sports-coach");
  assert.equal(coach.name, "運動部不適任教練專區");
  assert.equal(coach.baseUrl, "https://www.sports.gov.tw/News/6295");
  assert.equal(coach.icon, "🥋");
  assert.equal(coach.badge, "體育安全防護");
  assert.ok(coach.defaultTitle.includes("體育教練安全查核"));
  assert.ok(coach.defaultDescription.includes("運動部公告專區"));
  assert.equal(coach.defaultActionText, "查核不適任名單");
});

test("sports-coach: buildContextualPartnerUrl generates correct UTM parameters", () => {
  const url = buildContextualPartnerUrl(CONTEXTUAL_PARTNERS["sports-coach"].baseUrl);
  const parsed = new URL(url);
  assert.equal(parsed.hostname, "www.sports.gov.tw");
  assert.equal(parsed.pathname, "/News/6295");
  assert.equal(parsed.searchParams.get("utm_source"), "health.j172.tw");
  assert.equal(parsed.searchParams.get("utm_medium"), "contextual_banner");
  assert.equal(parsed.searchParams.get("utm_campaign"), "civic_partner");
});

test("sports-coach: CivicPartnersSection.tsx includes sports-coach immediately after metawilo", () => {
  const sectionContent = readFileSync(
    path.join(ROOT_DIR, "components", "Common", "CivicPartnersSection.tsx"),
    "utf-8"
  );
  assert.ok(
    sectionContent.includes('id: "sports-coach"'),
    "CivicPartnersSection must include sports-coach id"
  );
  assert.ok(
    sectionContent.includes('name: "運動部不適任教練專區"'),
    "CivicPartnersSection must include sports-coach name"
  );
  assert.ok(
    sectionContent.includes('url: "https://www.sports.gov.tw/News/6295"'),
    "CivicPartnersSection must include sports-coach url"
  );
  assert.ok(
    sectionContent.includes('badge: "體育安全"'),
    "CivicPartnersSection must include sports-coach badge"
  );

  const metawiloIndex = sectionContent.indexOf('id: "metawilo"');
  const coachIndex = sectionContent.indexOf('id: "sports-coach"');
  const councilIndex = sectionContent.indexOf('id: "council2026"');
  assert.ok(metawiloIndex !== -1 && coachIndex !== -1 && councilIndex !== -1);
  assert.ok(
    metawiloIndex < coachIndex && coachIndex < councilIndex,
    "sports-coach must be ordered between metawilo and council2026"
  );
});

test("sports-coach: SiteFooter.tsx contains sportsCoach footer link with UTM and HTTPS", () => {
  const footerContent = readFileSync(
    path.join(ROOT_DIR, "components", "News", "SiteFooter.tsx"),
    "utf-8"
  );
  assert.ok(
    footerContent.includes("https://www.sports.gov.tw/News/6295"),
    "SiteFooter must include sports.gov.tw URL"
  );
  assert.ok(
    footerContent.includes("footer.sportsCoach"),
    "SiteFooter must include footer.sportsCoach translation key"
  );
});

test("sports-coach: cram-schools tool page embeds compact dual cards for metawilo and sports-coach", () => {
  const pageContent = readFileSync(
    path.join(ROOT_DIR, "app", "tools", "cram-schools", "page.tsx"),
    "utf-8"
  );
  assert.ok(
    pageContent.includes('partnerId="metawilo"'),
    "cram-schools page must render metawilo partner card"
  );
  assert.ok(
    pageContent.includes('partnerId="sports-coach"'),
    "cram-schools page must render sports-coach partner card"
  );
  assert.ok(
    pageContent.includes("compact={true}"),
    "cram-schools page partner cards must be compact"
  );
});

test("sports-coach: all 4 locales define footer.sportsCoach key", () => {
  const locales = ["zh-TW", "en", "ja", "ko"];
  for (const locale of locales) {
    const filePath = path.join(ROOT_DIR, "locales", `${locale}.json`);
    const content = JSON.parse(readFileSync(filePath, "utf-8"));
    assert.ok(
      content.footer?.sportsCoach,
      `locales/${locale}.json must define footer.sportsCoach`
    );
  }
});
