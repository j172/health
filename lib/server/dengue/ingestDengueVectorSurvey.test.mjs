import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

process.env.MYSQL_HOST = "localhost";
process.env.MYSQL_USER = "test";
process.env.MYSQL_PASSWORD = "test";
process.env.MYSQL_DATABASE = "test";
process.env.RSS_SYNC_ADMIN_SECRET = "test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { dedupeLatestPerVillage, syncDengueVectorSurvey } = await import(
  "./ingestDengueVectorSurvey.ts"
);

test("Dengue vector survey: exports the sync entry point", () => {
  assert.equal(typeof syncDengueVectorSurvey, "function");
});

test("Dengue vector survey: dedupeLatestPerVillage keeps only the most recent Date per VillageID", () => {
  const records = [
    {
      Date: "2026-01-05",
      County: "臺南市",
      Town: "安平區",
      Village: "海頭里",
      VillageID: "V001",
      VillageLon: "120.16",
      VillageLat: "22.99",
      BI: "10",
      BILv: "3",
      HI: "8",
      HILv: "3",
      CI: "5",
      CILv: "2",
      LI: "20",
      LILv: "2",
      AI: "0.2",
      Con100HH: "150",
    },
    {
      // Same village, a later survey date — should win.
      Date: "2026-02-10",
      County: "臺南市",
      Town: "安平區",
      Village: "海頭里",
      VillageID: "V001",
      VillageLon: "120.16",
      VillageLat: "22.99",
      BI: "40",
      BILv: "5",
      HI: "30",
      HILv: "4",
      CI: "18",
      CILv: "4",
      LI: "120",
      LILv: "4",
      AI: "0.5",
      Con100HH: "160",
    },
    {
      // Different village entirely.
      Date: "2026-01-20",
      County: "高雄市",
      Town: "前鎮區",
      Village: "草衙里",
      VillageID: "V002",
      VillageLon: "120.30",
      VillageLat: "22.58",
      BI: "0",
      BILv: "0",
      HI: "0",
      HILv: "0",
      CI: "0",
      CILv: "0",
      LI: "0",
      LILv: "0",
      AI: "0",
      Con100HH: "90",
    },
  ];

  const rows = dedupeLatestPerVillage(records);
  assert.equal(rows.length, 2);

  const v001 = rows.find((r) => r.villageId === "V001");
  assert.ok(v001);
  assert.equal(v001.surveyDate, "2026-02-10");
  assert.equal(v001.bi, 40);
  assert.equal(v001.biLv, 5);

  const v002 = rows.find((r) => r.villageId === "V002");
  assert.ok(v002);
  assert.equal(v002.bi, 0);
  assert.equal(v002.biLv, 0);
});

test("Dengue vector survey: dedupeLatestPerVillage drops rows missing required fields", () => {
  const records = [
    {
      Date: "2026-01-05",
      County: "臺南市",
      Town: "安平區",
      Village: "海頭里",
      VillageID: "V001",
      VillageLon: "", // missing coordinate — dropped
      VillageLat: "22.99",
      BI: "10",
    },
    {
      Date: "", // missing date — dropped
      County: "臺南市",
      Town: "安平區",
      Village: "海頭里",
      VillageID: "V003",
      VillageLon: "120.16",
      VillageLat: "22.99",
      BI: "10",
    },
  ];

  const rows = dedupeLatestPerVillage(records);
  assert.equal(rows.length, 0);
});

test("Dengue vector survey: dedupeLatestPerVillage treats blank index fields as null, not 0", () => {
  const records = [
    {
      Date: "2026-01-05",
      County: "臺南市",
      Town: "安平區",
      Village: "海頭里",
      VillageID: "V004",
      VillageLon: "120.16",
      VillageLat: "22.99",
      BI: "",
      BILv: "",
      HI: "",
      HILv: "",
      CI: "",
      CILv: "",
      LI: "",
      LILv: "",
      AI: "",
      Con100HH: "",
    },
  ];

  const rows = dedupeLatestPerVillage(records);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bi, null);
  assert.equal(rows[0].biLv, null);
  assert.equal(rows[0].con100hh, null);
});
