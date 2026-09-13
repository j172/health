import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  transformTwblg,
  transformHakka,
} from "../scripts/import-moedict-languages.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

test("ETL: transformTwblg correctly normalizes dictionary entries and cleans markers", () => {
  const mockTwblg = [
    {
      title: "食飽",
      radical: "食",
      stroke_count: 9,
      heteronyms: [
        {
          id: "14653",
          trs: "tsia̍h-pá",
          definitions: [
            {
              type: "動",
              def: "吃飽。",
              example: [
                "￹腹肚枵無才調做工課，愛食飽才有氣力。￺Pak-tóo iau bô tsâi-tiāu tsò khang-khuè, ài tsia̍h pá tsiah ū khuì-la̍t. ￻肚子餓沒辦法工作，要吃飽才有力氣。",
              ],
            },
          ],
        },
      ],
    },
  ];

  const transformed = transformTwblg(mockTwblg);
  assert.equal(transformed.length, 1);
  const item = transformed[0];
  assert.equal(item.title, "食飽");
  assert.equal(item.lang, "twblg");
  assert.equal(item.pinyin, "tsia̍h-pá");
  assert.equal(item.audio_id, "14653");
  assert.equal(item.radical, "食");
  assert.equal(item.stroke_count, 9);
  assert.ok(item.mandarin_keywords.includes("吃飽"));
  assert.ok(item.mandarin_keywords.includes("肚子餓"));
  assert.equal(item.definitions[0].type, "動");
  assert.equal(item.definitions[0].def, "吃飽。");
  assert.equal(item.definitions[0].example[0].text, "腹肚枵無才調做工課，愛食飽才有氣力。");
  assert.equal(item.definitions[0].example[0].mandarin, "肚子餓沒辦法工作，要吃飽才有力氣。");
});

test("ETL: transformHakka correctly extracts multiple dialects and audio ID", () => {
  const mockHakka = [
    {
      title: "恁仔細",
      heteronyms: [
        {
          audio_id: "00120",
          pinyin: "四⃞an³¹zii³¹se⁵⁵ 平⃞an⁵³zii⁵³se⁵³",
          definitions: [
            {
              type: "",
              def: "僅四縣用，海陸為「承蒙」。謝謝。",
              example: [
                "￹感謝大家摎𠊎𢯭手伐草，恁仔細。￻感謝大家幫我除草，謝謝。",
              ],
            },
          ],
        },
      ],
    },
  ];

  const transformed = transformHakka(mockHakka);
  assert.equal(transformed.length, 1);
  const item = transformed[0];
  assert.equal(item.title, "恁仔細");
  assert.equal(item.lang, "hakka");
  assert.equal(item.audio_id, "00120");
  assert.equal(item.dialects.sixian, "an³¹zii³¹se⁵⁵");
  assert.equal(item.dialects.raoping, "an⁵³zii⁵³se⁵³");
  assert.ok(item.mandarin_keywords.includes("謝謝"));
  assert.equal(item.definitions[0].example[0].text, "感謝大家摎𠊎𢯭手伐草，恁仔細。");
  assert.equal(item.definitions[0].example[0].mandarin, "感謝大家幫我除草，謝謝。");
});

test("Seed: child-native-languages-seed.json has valid structure and contains essential entries", () => {
  const seedPath = path.join(ROOT_DIR, "data", "child-native-languages-seed.json");
  assert.ok(fs.existsSync(seedPath), "Seed file must exist");

  const raw = fs.readFileSync(seedPath, "utf-8");
  const data = JSON.parse(raw);

  assert.ok(data.languages.twblg.entries.length > 500, "twblg must have > 500 entries");
  assert.ok(data.languages.hakka.entries.length > 500, "hakka must have > 500 entries");

  // Check key words
  const twblgEntries = data.languages.twblg.entries;
  const hakkaEntries = data.languages.hakka.entries;

  const hasTwblgEat = twblgEntries.some((e) => e.title.includes("食"));
  assert.ok(hasTwblgEat, "twblg should contain food/eat entries");

  const hasHakkaThanks = hakkaEntries.some((e) => e.mandarin_keywords?.includes("謝謝") || e.title === "恁仔細");
  assert.ok(hasHakkaThanks, "hakka should contain thank-you/greetings entries");
});

test("Catalog & Spec: catalog.ts and SPECIFICATION.md register child-native-languages", () => {
  const catalogPath = path.join(ROOT_DIR, "lib", "server", "tools", "catalog.ts");
  const catalogContent = fs.readFileSync(catalogPath, "utf-8");

  assert.ok(catalogContent.includes('slug: "child-native-languages"'), "Must register slug");
  assert.ok(catalogContent.includes('group: "child-welfare"'), "Must belong to child-welfare");
  assert.ok(catalogContent.includes('title: "兒少本土語言辭典（閩南語／客語）"'), "Must have correct title");

  const specPath = path.join(ROOT_DIR, "docs", "SPECIFICATION.md");
  const specContent = fs.readFileSync(specPath, "utf-8");
  assert.ok(specContent.includes("兒少本土語言辭典（閩南語／客語）"), "SPECIFICATION must include dictionary");
  assert.ok(specContent.includes("Total: 55 tools"), "SPECIFICATION must reflect 55 tools total");
});
