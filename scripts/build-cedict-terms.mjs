/**
 * One-off generator for lib/server/news/data/cedict-terms.json — a compact
 * { traditionalWord: englishGloss } lookup table used by
 * lib/server/news/cedict.ts as a middle tier for news-card image search
 * terms (see deriveDictionaryTerm in imageSearchTerms.ts). Not run at
 * request time; re-run manually if CC-CEDICT's upstream data should be
 * refreshed.
 *
 * Source: CC-CEDICT, Community-maintained free Chinese-English dictionary,
 * published by MDBG (https://www.mdbg.net/chinese/dictionary?page=cc-cedict),
 * licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).
 *
 * Usage: download the "ts" (traditional/simplified) export from the URL
 * above, gzip it, then run:
 *   node scripts/build-cedict-terms.mjs path/to/cedict_ts.u8.gz lib/server/news/data/cedict-terms.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const UNUSABLE_DEF_PATTERN = /variant of|see also|see \p{Script=Han}|abbr\. for|used in|surname\b|old form of|CL:/u;

const cleanGloss = (def) => {
  let text = def
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .split(/[,;]/)[0]
    .replace(/^to\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const words = text.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 3) return null;
  text = words.join(" ");
  if (!/^[A-Za-z][A-Za-z\s-]*$/.test(text)) return null;
  return text.toLowerCase();
};

const gzPath = process.argv[2];
const outPath = process.argv[3];

const raw = gunzipSync(readFileSync(gzPath)).toString("utf-8");
const map = {};
for (const rawLine of raw.split("\n")) {
  const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
  if (!line || line.startsWith("#")) continue;
  const slashIdx = line.indexOf("/");
  if (slashIdx === -1) continue;
  const head = line.slice(0, slashIdx).trim();
  const spaceIdx = head.indexOf(" ");
  if (spaceIdx === -1) continue;
  const traditional = head.slice(0, spaceIdx);
  if (traditional.length < 2 || Object.prototype.hasOwnProperty.call(map, traditional)) continue;

  // CC-CEDICT capitalizes the first pinyin syllable for proper nouns (people,
  // places, brands, titles) and leaves it lowercase for common nouns/verbs —
  // e.g. "台北 [Tai2 bei3] /Taipei, capital of Taiwan/" vs "地震 [di4 zhen4]
  // /earthquake/". Confirmed live: without this filter, celebrity names like
  // 楊丞琳 (Rainie Yang) leaked through as image-provider search terms.
  const pinyinMatch = head.match(/\[([^\]]*)\]/);
  const firstSyllable = pinyinMatch?.[1]?.trim().split(/\s+/)[0];
  if (firstSyllable && /^[A-Z]/.test(firstSyllable)) continue;
  const defs = line.slice(slashIdx).split("/").filter(Boolean);
  for (const def of defs) {
    if (UNUSABLE_DEF_PATTERN.test(def)) continue;
    const gloss = cleanGloss(def);
    if (gloss) {
      map[traditional] = gloss;
      break;
    }
  }
}
const count = Object.keys(map).length;
writeFileSync(outPath, JSON.stringify(map));
console.log("entries written:", count, "->", outPath);
