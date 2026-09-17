#!/usr/bin/env node
/**
 * scripts/migrate-tai-to-tai.mjs
 * 
 * 將 data/ 與 data/facilities-seeds/ 底下的所有種子 JSON 檔案
 * 全面清洗為標準正體字「臺」（包含臺灣、臺北、臺中、臺南、臺東、平臺、服務臺等）。
 * 
 * 避開 url、link、website、id、hash 等識別欄位，僅轉換名稱、地址、縣市與描述文案。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const REPLACEMENTS = [
  [/台北/g, "臺北"],
  [/台中/g, "臺中"],
  [/台南/g, "臺南"],
  [/台東/g, "臺東"],
  [/台灣/g, "臺灣"],
  [/全台/g, "全臺"],
  [/平台/g, "平臺"],
  [/服務台/g, "服務臺"],
  [/櫃台/g, "櫃檯"],
  [/月台/g, "月臺"],
  [/舞臺/g, "舞臺"],
  [/舞台/g, "舞臺"],
  [/後台/g, "後臺"],
  [/台鐵/g, "臺鐵"],
  [/台電/g, "臺電"],
  [/台大/g, "臺大"],
  [/台銀/g, "臺銀"],
  [/台西/g, "臺西"],
  [/霧台/g, "霧臺"],
  [/洗手台/g, "洗手臺"],
  [/尿布台/g, "尿布臺"],
];

const EXCLUDED_KEYS = new Set([
  "id",
  "sourceId",
  "source_id",
  "url",
  "website",
  "link",
  "href",
  "src",
  "imageUrl",
  "charityUrl",
  "hash",
  "sha256",
  "md5",
  "code",
  "stationCode",
  "zipCode",
  "postalCode",
]);

function sanitizeString(str) {
  if (typeof str !== "string") return str;
  // If string looks like a full URL, skip modifying it
  if (/^https?:\/\//i.test(str.trim())) return str;

  let result = str;
  for (const [re, rep] of REPLACEMENTS) {
    result = result.replace(re, rep);
  }
  return result;
}

function walkAndTransform(obj, keyName = "") {
  if (EXCLUDED_KEYS.has(keyName)) {
    return obj;
  }
  if (typeof obj === "string") {
    return sanitizeString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => walkAndTransform(item, keyName));
  }
  if (obj !== null && typeof obj === "object") {
    const next = {};
    for (const [k, v] of Object.entries(obj)) {
      next[k] = walkAndTransform(v, k);
    }
    return next;
  }
  return obj;
}

function processJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const transformed = walkAndTransform(parsed);
    const newRaw = JSON.stringify(transformed, null, 2) + "\n";
    if (newRaw !== raw) {
      fs.writeFileSync(filePath, newRaw, "utf8");
      console.log(`✅ 已清洗: ${path.relative(ROOT_DIR, filePath)}`);
      return 1;
    }
  } catch (err) {
    console.error(`❌ 處理失敗 ${filePath}:`, err.message);
  }
  return 0;
}

function scanDir(dir) {
  let count = 0;
  if (!fs.existsSync(dir)) return count;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += scanDir(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      count += processJsonFile(fullPath);
    }
  }
  return count;
}

console.log("開始清洗 data/ 目錄下的種子 JSON 檔案...");
const dataCount = scanDir(path.join(ROOT_DIR, "data"));
console.log(`\n清洗完成！共更新了 ${dataCount} 個種子資料檔。`);
