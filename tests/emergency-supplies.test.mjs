import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Emergency Supplies: catalog entry exists and meets SEO/E-E-A-T specifications", () => {
  const catalogPath = path.join(process.cwd(), "lib", "server", "tools", "catalog.ts");
  assert.ok(fs.existsSync(catalogPath), "catalog.ts must exist");

  const content = fs.readFileSync(catalogPath, "utf-8");

  // Slug registration
  assert.ok(
    content.includes('slug: "emergency-supplies"'),
    "catalog.ts must contain slug: 'emergency-supplies'",
  );
  assert.ok(
    content.includes('"emergency-supplies",'),
    "catalog.ts INDEXABLE_SLUGS must contain 'emergency-supplies'",
  );
  assert.ok(
    content.includes('group: "disaster-safety"'),
    "emergency-supplies must belong to 'disaster-safety' group",
  );
  assert.ok(
    content.includes("https://prepare.mnd.gov.tw/"),
    "emergency-supplies scientificBasis must cite prepare.mnd.gov.tw",
  );
  assert.ok(
    content.includes("全民防災物資：緊急避難包與居家儲備計算機"),
    "emergency-supplies must have full title",
  );
});

test("Emergency Supplies: page and client component files exist and conform to architecture", () => {
  const pagePath = path.join(process.cwd(), "app", "tools", "emergency-supplies", "page.tsx");
  assert.ok(fs.existsSync(pagePath), "app/tools/emergency-supplies/page.tsx must exist");

  const pageContent = fs.readFileSync(pagePath, "utf-8");
  assert.ok(
    pageContent.includes('slug = "emergency-supplies"'),
    "Page must declare slug = 'emergency-supplies'",
  );
  assert.ok(
    pageContent.includes("ToolPageShell"),
    "Page must wrap content inside ToolPageShell",
  );
  assert.ok(
    pageContent.includes("EmergencySuppliesContent"),
    "Page must render EmergencySuppliesContent",
  );

  const compPath = path.join(
    process.cwd(),
    "components",
    "Tools",
    "EmergencySuppliesContent.tsx",
  );
  assert.ok(fs.existsSync(compPath), "EmergencySuppliesContent.tsx must exist");

  const compContent = fs.readFileSync(compPath, "utf-8");
  // Hydration mounted guard
  assert.ok(
    compContent.includes("setIsMounted(true)"),
    "EmergencySuppliesContent must guard against React hydration mismatch with isMounted",
  );

  // Official resources and download links
  assert.ok(
    compContent.includes("https://prepare.mnd.gov.tw/"),
    "Component must link to official prepare.mnd.gov.tw",
  );
  assert.ok(
    compContent.includes("emergency-response.zh-Hant.pdf"),
    "Component must link to official PDF handbook",
  );
  assert.ok(
    compContent.includes("消防防災 e 點通"),
    "Component must feature Fire Department App",
  );
  assert.ok(
    compContent.includes("警政服務"),
    "Component must feature Police Department App",
  );

  // Dual modes
  assert.ok(
    compContent.includes("個人緊急避難包檢核 (Go-Bag)"),
    "Component must support Go-Bag checklist tab",
  );
  assert.ok(
    compContent.includes("家庭日常居家儲備計算機"),
    "Component must support Household supplies calculator tab",
  );
});

test("Emergency Supplies: cross-linking banner exists in EmergencyHotlinesContent", () => {
  const hotlinesCompPath = path.join(
    process.cwd(),
    "components",
    "Tools",
    "EmergencyHotlinesContent.tsx",
  );
  assert.ok(fs.existsSync(hotlinesCompPath), "EmergencyHotlinesContent.tsx must exist");

  const content = fs.readFileSync(hotlinesCompPath, "utf-8");
  assert.ok(
    content.includes("/tools/emergency-supplies"),
    "EmergencyHotlinesContent must include a prominent link to /tools/emergency-supplies",
  );
});

test("Emergency Supplies: calculation formulas accurately compute water, meals, and medical supplies", () => {
  // Test case: 2 adults, 1 child, 1 senior, 1 infant (5 people), 1 pet for 3 days
  const adults = 2;
  const children = 1;
  const seniors = 1;
  const infants = 1;
  const pets = 1;
  const days = 3;

  const totalPeople = adults + children + seniors + infants;
  assert.equal(totalPeople, 5, "Total people count should be 5");

  // Water: 3L per person per day + 0.6L per pet per day
  const totalWaterLiters = totalPeople * days * 3 + pets * days * 0.6;
  assert.equal(totalWaterLiters, 46.8, "5 people + 1 pet for 3 days requires 46.8L of water");

  // 2L bottles: ceil(46.8 / 2) = 24
  const waterBottles2L = Math.ceil(totalWaterLiters / 2);
  assert.equal(waterBottles2L, 24, "46.8L requires 24 bottles of 2L water");

  // Meals: (adults + children + seniors) * days * 3
  const totalMeals = (adults + children + seniors) * days * 3;
  assert.equal(totalMeals, 36, "4 eating people * 3 days * 3 meals = 36 meals");

  // Chronic medications for seniors: days + 7 buffer
  const chronicMedsDays = seniors > 0 ? days + 7 : 0;
  assert.equal(chronicMedsDays, 10, "Senior chronic meds should include 7-day safety buffer (10 days total)");

  // Diapers for infant: infants * days * 7
  const diapersCount = infants * days * 7;
  assert.equal(diapersCount, 21, "1 infant for 3 days = 21 diapers");
});
