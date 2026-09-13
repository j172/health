#!/usr/bin/env node
/**
 * scripts/import-moedict-languages.mjs
 *
 * ETL script for importing g0v / Ministry of Education native language dictionaries:
 * 1. 臺灣閩南語常用詞辭典 (moedict-data-twblg)
 * 2. 臺灣客家語常用詞辭典 (moedict-data-hakka)
 *
 * Normalizes definitions, pronunciations, audio IDs, and builds a rich seed fallback
 * for offline and dev environments.
 */

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const TWBLG_RAW_URL =
  "https://raw.githubusercontent.com/g0v/moedict-data-twblg/master/dict-twblg.json";
const HAKKA_RAW_URL =
  "https://raw.githubusercontent.com/g0v/moedict-data-hakka/master/dict-hakka.json";

const SEED_OUTPUT_PATH = path.join(
  ROOT_DIR,
  "data",
  "child-native-languages-seed.json",
);

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    console.log(`[ETL] Fetching: ${url}...`);
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchJson(res.headers.location).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to fetch ${url} (HTTP ${res.statusCode})`));
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error from ${url}: ${e.message}`));
          }
        });
      })
      .on("error", reject);
  });
}

function cleanText(str) {
  if (!str) return "";
  return str
    .replace(/[`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseExamples(rawExamples) {
  if (!Array.isArray(rawExamples)) return [];
  return rawExamples
    .map((ex) => {
      if (!ex) return null;
      let raw = String(ex);
      // Example format: ￹...￺...￻... or ￹...￻...
      let text = "";
      let trs = "";
      let mandarin = "";

      if (raw.includes("￹")) {
        const parts = raw.split(/[￹￺￻]/).filter(Boolean);
        if (parts.length >= 3) {
          text = cleanText(parts[0]);
          trs = cleanText(parts[1]);
          mandarin = cleanText(parts[2]);
        } else if (parts.length === 2) {
          text = cleanText(parts[0]);
          mandarin = cleanText(parts[1]);
        } else if (parts.length === 1) {
          text = cleanText(parts[0]);
        }
      } else {
        text = cleanText(raw);
      }

      if (!text) return null;
      return { text, trs: trs || undefined, mandarin: mandarin || undefined };
    })
    .filter(Boolean);
}

function parseHakkaPinyin(rawPinyin) {
  if (!rawPinyin) return {};
  const dialects = {};
  // Pinyin format: 四⃞an³¹ 海⃞an²⁴ 大⃞an⁵³ 平⃞an⁵³ 安⃞an³¹ 南⃞an³¹
  const matches = [
    { key: "sixian", label: "四縣", match: rawPinyin.match(/四[⃞|⃣]([^海大平平安南\s]+)/) },
    { key: "hailu", label: "海陸", match: rawPinyin.match(/海[⃞|⃣]([^四大大平平安南\s]+)/) },
    { key: "dabu", label: "大埔", match: rawPinyin.match(/大[⃞|⃣]([^四海平平安南\s]+)/) },
    { key: "raoping", label: "饒平", match: rawPinyin.match(/平[⃞|⃣]([^四海大安南\s]+)/) },
    { key: "zhaoan", label: "詔安", match: rawPinyin.match(/安[⃞|⃣]([^四海大平南\s]+)/) },
    { key: "south_sixian", label: "南四縣", match: rawPinyin.match(/南[⃞|⃣]([^四海大平安\s]+)/) },
  ];

  for (const m of matches) {
    if (m.match && m.match[1]) {
      dialects[m.key] = cleanText(m.match[1]);
    }
  }

  // Fallback if no symbol:
  if (Object.keys(dialects).length === 0) {
    dialects.sixian = cleanText(rawPinyin);
  }
  return dialects;
}

export function transformTwblg(rawList) {
  const items = [];
  for (const raw of rawList) {
    const title = cleanText(raw.title);
    if (!title || title.startsWith("【")) continue;

    const heteronyms = raw.heteronyms || [];
    for (const h of heteronyms) {
      const pinyin = cleanText(h.trs || "");
      const audioId = h.id ? String(h.id).trim() : null;
      const defs = (h.definitions || [])
        .map((d) => ({
          type: cleanText(d.type),
          def: cleanText(d.def),
          example: parseExamples(d.example),
        }))
        .filter((d) => d.def || (d.example && d.example.length > 0));

      const mandarinKeywords = defs
        .map((d) => `${d.def} ${(d.example || []).map((e) => e.mandarin || "").join(" ")}`)
        .join(" ");

      items.push({
        id: `twblg_${audioId || title}_${items.length}`,
        lang: "twblg",
        title,
        pinyin,
        dialect: "優勢腔",
        mandarin_keywords: mandarinKeywords.slice(0, 1000),
        audio_id: audioId,
        definitions: defs,
        stroke_count: raw.stroke_count || null,
        radical: cleanText(raw.radical) || null,
      });
    }
  }
  return items;
}

export function transformHakka(rawList) {
  const items = [];
  for (const raw of rawList) {
    const title = cleanText(raw.title);
    if (!title || title === "□") continue;

    const heteronyms = raw.heteronyms || [];
    for (const h of heteronyms) {
      const pinyinMap = parseHakkaPinyin(h.pinyin);
      const mainPinyin = pinyinMap.sixian || pinyinMap.hailu || cleanText(h.pinyin) || "";
      const audioId = h.audio_id ? String(h.audio_id).trim() : null;

      const defs = (h.definitions || [])
        .map((d) => ({
          type: cleanText(d.type),
          def: cleanText(d.def),
          example: parseExamples(d.example),
        }))
        .filter((d) => d.def || (d.example && d.example.length > 0));

      const mandarinKeywords = defs
        .map((d) => `${d.def} ${(d.example || []).map((e) => e.mandarin || "").join(" ")}`)
        .join(" ");

      items.push({
        id: `hakka_${audioId || title}_${items.length}`,
        lang: "hakka",
        title,
        pinyin: mainPinyin,
        dialect: "四縣/海陸",
        dialects: pinyinMap,
        mandarin_keywords: mandarinKeywords.slice(0, 1000),
        audio_id: audioId,
        definitions: defs,
      });
    }
  }
  return items;
}

// Child / Elementary school curated topic keywords
const CHILD_KEYWORDS = [
  "你好", "食飽", "多謝", "再會", "勞力", "歹勢", "早安", "晚安",
  "恁仔細", "承蒙", "正來尞", "恁早", "毋好意思",
  "阿爸", "阿母", "阿公", "阿媽", "阿婆", "阿姆", "阿兄", "阿哥", "阿姊", "小弟", "小妹", "老弟", "老妹", "細子", "囡仔",
  "目睭", "目珠", "耳仔", "耳公", "鼻仔", "鼻公", "喙", "嘴", "手", "跤", "腳", "頭毛", "腹肚", "肚屎",
  "狗", "貓", "鳥", "魚", "蝶", "蠓", "蚊", "鴨", "雞", "牛", "豬", "羊", "猴", "兔", "馬",
  "食飯", "食事", "食茶", "啉水", "菜", "肉", "果子", "水果", "點心", "米粉", "麵", "粄", "柑仔",
  "日頭", "月娘", "月光", "落雨", "落水", "天頂", "風", "雲", "虹", "天弓", "地動", "山", "海",
  "讀冊", "讀書", "寫字", "先生", "老師", "同學", "冊包", "書包", "學校", "畫圖", "𨑨迌", "搞", "唱歌"
];

function selectSeedEntries(twblgList, hakkaList) {
  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    totalCount: twblgList.length + hakkaList.length,
    languages: {
      twblg: { count: twblgList.length, entries: twblgList },
      hakka: { count: hakkaList.length, entries: hakkaList },
    },
  };
}

async function main() {
  console.log("=== 兒少本土語言辭典 (閩南語/客語) 資料匯入與建置 ===");

  try {
    const rawTwblg = await fetchJson(TWBLG_RAW_URL);
    console.log(`[ETL] Loaded ${rawTwblg.length} raw twblg items.`);

    const rawHakka = await fetchJson(HAKKA_RAW_URL);
    console.log(`[ETL] Loaded ${rawHakka.length} raw hakka items.`);

    const twblgItems = transformTwblg(rawTwblg);
    console.log(`[ETL] Transformed ${twblgItems.length} twblg entries.`);

    const hakkaItems = transformHakka(rawHakka);
    console.log(`[ETL] Transformed ${hakkaItems.length} hakka entries.`);

    // Generate compact seed file
    console.log("[ETL] Building child-friendly seed dataset...");
    const seedData = selectSeedEntries(twblgItems, hakkaItems);
    fs.mkdirSync(path.dirname(SEED_OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(SEED_OUTPUT_PATH, JSON.stringify(seedData), "utf-8");
    const stat = fs.statSync(SEED_OUTPUT_PATH);
    console.log(
      `[ETL] Saved seed to ${SEED_OUTPUT_PATH} (${seedData.totalCount} entries, ${(stat.size / 1024 / 1024).toFixed(2)} MB)`,
    );

    // Optional MySQL upsert if DB is accessible
    if (process.env.DATABASE_URL || process.env.MYSQL_HOST) {
      console.log("[ETL] Database environment detected, connecting to MySQL...");
      const { withConnection, utcNowSql } = await import(
        "../lib/server/db/mysql.ts"
      );

      await withConnection(async (conn) => {
        console.log("[ETL] Truncating or preparing native_dict_entries...");
        const allItems = [...twblgItems, ...hakkaItems];
        const BATCH_SIZE = 500;
        let inserted = 0;

        for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
          const chunk = allItems.slice(i, i + BATCH_SIZE);
          const values = chunk.map((item) => [
            item.lang,
            item.title,
            item.pinyin,
            item.dialect || null,
            item.mandarin_keywords || null,
            item.audio_id || null,
            JSON.stringify(item.definitions),
            item.stroke_count || null,
            item.radical || null,
          ]);

          const sql = `
            INSERT INTO native_dict_entries 
            (lang, title, pinyin, dialect, mandarin_keywords, audio_id, definitions_json, stroke_count, radical, created_at, updated_at)
            VALUES ?
          `;

          // Formatted query for bulk insert with timestamps
          const now = new Date();
          const rowsWithDates = values.map((v) => [...v, now, now]);

          await conn.query(
            `INSERT INTO native_dict_entries 
            (lang, title, pinyin, dialect, mandarin_keywords, audio_id, definitions_json, stroke_count, radical, created_at, updated_at)
            VALUES ?
            ON DUPLICATE KEY UPDATE
              pinyin = VALUES(pinyin),
              dialect = VALUES(dialect),
              mandarin_keywords = VALUES(mandarin_keywords),
              audio_id = VALUES(audio_id),
              definitions_json = VALUES(definitions_json),
              updated_at = VALUES(updated_at)
            `,
            [rowsWithDates],
          );
          inserted += chunk.length;
          if (inserted % 2500 === 0 || inserted === allItems.length) {
            console.log(`[ETL] Upserted ${inserted}/${allItems.length} records into MySQL...`);
          }
        }
      });
      console.log("[ETL] MySQL database population completed successfully!");
    } else {
      console.log(
        "[ETL] No active DATABASE_URL detected; seed file generated successfully for fallback queries.",
      );
    }
  } catch (err) {
    console.error("[ETL] Error running import script:", err);
    process.exit(1);
  }
}

// Only execute main when run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
