#!/usr/bin/env node
/**
 * Regenerates `TAIWAN_DISTRICT_COORDINATES` in
 * lib/server/news/data/taiwanDistricts.ts from the Ministry of the Interior's
 * official township boundary shapefile, so that all 368 of Taiwan's districts
 * are present rather than the 122 metropolitan ones that were hand-listed.
 *
 * Committed alongside its output on purpose: the next boundary revision (the MOI
 * publishes one every few months) should be a re-run of this file, not an
 * archaeology exercise over a 400-line literal.
 *
 * What it does
 *   1. Downloads 鄉(鎮、市、區)界線 1140318 from TGOS (~12.8 MB zip).
 *   2. Parses TOWN_MOI_1140318.dbf and .shp with plain Buffer reads — no
 *      shapefile library and no projection library:
 *        - .CPG says UTF-8, so the .dbf decodes directly (no Big5 step).
 *        - .prj says GEOGCS["GCS_TWD97[2020]"], i.e. the coordinates are ALREADY
 *          decimal degrees, and TWD97 agrees with WGS84 to the centimetre. There
 *          is nothing to reproject.
 *   3. Computes each district's area centroid over its LARGEST ring (the signed
 *      area / first-moment formula), so offshore islets and river islands cannot
 *      drag a township's marker into the sea.
 *   4. Merges with the table already in the repo and rewrites it.
 *
 * THE MERGE RULE — the 122 pre-existing entries keep their lat/lng byte for byte.
 * Only districts absent from the table get a computed centroid. The hand-picked
 * values are better exactly where an area centroid is worst: 花蓮縣秀林鄉's
 * population lives on the Taroko coast while its area centroid lands 14.7 km away
 * in the uninhabited Central Mountain Range (likewise 桃園市復興區 10.5 km,
 * 新北市烏來區 8.6 km). Recomputing them would be a silent regression for zero gain.
 *
 * Names are normalized 臺 → 台 to match the existing table. `location_name` is
 * written verbatim from `fullName` and `classifyLocationPrecision` matches it
 * exactly against this table, so a 臺-spelled row would classify as `geocoded` —
 * the fallback bucket — and draw a precise map card for a district centroid.
 *
 * Usage:
 *   node scripts/extract-district-centroids.mjs            # rewrite the table
 *   node scripts/extract-district-centroids.mjs --dry-run  # report only
 *   TOWN_ZIP=/path/to/local.zip node scripts/extract-district-centroids.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import AdmZip from "adm-zip";

const SOURCE_URL =
  "https://www.tgos.tw/tgos/VirtualDir/Product/3fe61d4a-ca23-4f45-8aca-4a536f40f290/" +
  encodeURIComponent("鄉(鎮、市、區)界線1140318.zip");
const LAYER = "TOWN_MOI_1140318";
const EXPECTED_RECORDS = 368;

const TABLE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "server",
  "news",
  "data",
  "taiwanDistricts.ts",
);

/** North-to-south county order, matching TAIWAN_COUNTY_CENTROIDS in the table. */
const COUNTY_ORDER = [
  "台北市",
  "新北市",
  "基隆市",
  "桃園市",
  "新竹市",
  "新竹縣",
  "苗栗縣",
  "台中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義市",
  "嘉義縣",
  "台南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "台東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
];

/** The MOI writes 臺, the table writes 台. See the header note on why this matters. */
const toTai = (text) => text.replace(/臺/g, "台");

// ---------------------------------------------------------------------------
// .dbf — dBASE III attribute table
// ---------------------------------------------------------------------------

/**
 * Header: record count at offset 4 (uint32 LE), header length at 8 and record
 * length at 10 (uint16 LE). Field descriptors are 32 bytes each from offset 32
 * until the 0x0D terminator. Every record starts with a 1-byte deletion flag.
 */
function parseDbf(buffer) {
  const recordCount = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);

  const fields = [];
  for (let offset = 32; buffer[offset] !== 0x0d; offset += 32) {
    fields.push({
      name: buffer.toString("utf8", offset, offset + 11).replace(/\0.*$/, ""),
      length: buffer[offset + 16],
    });
  }

  const rows = [];
  for (let i = 0; i < recordCount; i++) {
    let cursor = headerLength + i * recordLength + 1; // +1 skips the deletion flag
    const row = {};
    for (const field of fields) {
      row[field.name] = buffer
        .toString("utf8", cursor, cursor + field.length)
        .trim();
      cursor += field.length;
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// .shx / .shp — geometry
// ---------------------------------------------------------------------------

/** Record offsets live in the .shx: 100-byte header, then 8 bytes per record. */
function readShapeOffsets(shx) {
  const count = (shx.length - 100) / 8;
  const offsets = [];
  for (let i = 0; i < count; i++) {
    // Big-endian, and counted in 16-bit words — hence the doubling.
    offsets.push(shx.readInt32BE(100 + i * 8) * 2);
  }
  return offsets;
}

/**
 * Rings of one polygon record. Layout from the record's content start:
 * shapeType (4 bytes), bbox (32), numParts at +36, numPoints at +40, the part
 * index array, then numPoints pairs of little-endian doubles (x = lng, y = lat).
 * The +8 skips the record header (record number + content length).
 */
function readPolygonRings(shp, recordOffset) {
  const start = recordOffset + 8;
  const shapeType = shp.readInt32LE(start);
  if (shapeType !== 5) {
    throw new Error(`Expected polygon (shape type 5), got ${shapeType}`);
  }
  const numParts = shp.readInt32LE(start + 36);
  const numPoints = shp.readInt32LE(start + 40);

  const partsAt = start + 44;
  const pointsAt = partsAt + numParts * 4;
  const partStarts = [];
  for (let i = 0; i < numParts; i++) {
    partStarts.push(shp.readInt32LE(partsAt + i * 4));
  }

  const rings = [];
  for (let part = 0; part < numParts; part++) {
    const from = partStarts[part];
    const to = part + 1 < numParts ? partStarts[part + 1] : numPoints;
    const ring = [];
    for (let i = from; i < to; i++) {
      const at = pointsAt + i * 16;
      ring.push([shp.readDoubleLE(at), shp.readDoubleLE(at + 8)]);
    }
    rings.push(ring);
  }
  return rings;
}

/**
 * Area centroid of a closed ring (the standard signed-area / first-moment
 * formula), plus the |area| used to pick the largest ring. Degrees are treated as
 * a flat plane: over a township-sized extent at Taiwan's latitude the resulting
 * bias is far below the 4-decimal (~11 m) precision the table stores.
 */
function ringCentroid(ring) {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (twiceArea === 0) return null;
  return {
    lng: cx / (3 * twiceArea),
    lat: cy / (3 * twiceArea),
    area: Math.abs(twiceArea / 2),
  };
}

/** Centroid of the largest ring — islets must not pull a marker offshore. */
function largestRingCentroid(rings) {
  let best = null;
  for (const ring of rings) {
    const centroid = ringCentroid(ring);
    if (centroid && (!best || centroid.area > best.area)) best = centroid;
  }
  if (!best) throw new Error("Polygon had no ring with non-zero area");
  return best;
}

// ---------------------------------------------------------------------------
// The existing table
// ---------------------------------------------------------------------------

const ENTRY_RE =
  /\{\s*county:\s*"([^"]+)",\s*district:\s*"([^"]+)",\s*fullName:\s*"([^"]+)",\s*lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+)\s*\},/g;

/**
 * Reads the current entries, keeping `lat`/`lng` as the SOURCE TEXT rather than
 * as numbers, so re-emitting them is byte-identical: 121.3010 must not lose its
 * trailing zero on the round trip through Number.
 */
function readExistingEntries(source) {
  const arrayStart = source.indexOf(
    "export const TAIWAN_DISTRICT_COORDINATES",
  );
  if (arrayStart < 0) throw new Error("TAIWAN_DISTRICT_COORDINATES not found");
  const entries = new Map();
  for (const match of source.slice(arrayStart).matchAll(ENTRY_RE)) {
    entries.set(match[3], {
      county: match[1],
      district: match[2],
      fullName: match[3],
      lat: match[4],
      lng: match[5],
      order: entries.size,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function loadZip() {
  const local = process.env.TOWN_ZIP;
  if (local) {
    console.log(`📦 使用本機檔案: ${local}`);
    return new AdmZip(readFileSync(local));
  }
  console.log(`⬇️  下載內政部鄉鎮市區界線: ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "j172-health-sync/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: 無法下載界線圖資`);
  const buffer = Buffer.from(await res.arrayBuffer());
  console.log(`   取得 ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
  return new AdmZip(buffer);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("=================================================");
  console.log("🗺  [Districts] 產生 TAIWAN_DISTRICT_COORDINATES（368 個鄉鎮市區）");
  console.log("=================================================\n");

  const zip = await loadZip();
  const entryOf = (extension) => {
    const found = zip.getEntry(`${LAYER}.${extension}`);
    if (!found) throw new Error(`zip 內找不到 ${LAYER}.${extension}`);
    return found.getData();
  };

  const cpg = entryOf("CPG").toString("utf8").trim();
  const prj = entryOf("prj").toString("utf8");
  console.log(`   編碼 (.CPG): ${cpg}`);
  console.log(`   投影 (.prj): ${prj.slice(0, 34)}…`);
  if (!/utf-?8/i.test(cpg)) throw new Error(`預期 UTF-8，實際為 ${cpg}`);
  if (!/GEOGCS/.test(prj)) throw new Error("預期為地理座標系（度），不可直接使用");

  const rows = parseDbf(entryOf("dbf"));
  const shp = entryOf("shp");
  const offsets = readShapeOffsets(entryOf("shx"));
  console.log(`   .dbf 筆數: ${rows.length}    .shx 筆數: ${offsets.length}\n`);
  if (rows.length !== EXPECTED_RECORDS || offsets.length !== EXPECTED_RECORDS) {
    throw new Error(
      `預期 ${EXPECTED_RECORDS} 筆，實際 dbf=${rows.length} shx=${offsets.length}`,
    );
  }

  const existing = readExistingEntries(readFileSync(TABLE_PATH, "utf8"));
  console.log(`   現有表格: ${existing.size} 筆（座標原封不動保留）\n`);

  const districts = rows.map((row, index) => {
    const county = toTai(row.COUNTYNAME);
    const district = toTai(row.TOWNNAME);
    const fullName = county + district;
    const kept = existing.get(fullName);
    if (kept) {
      // Byte-for-byte: the literal text from the file, not a re-formatted number.
      return {
        county,
        district,
        fullName,
        lat: kept.lat,
        lng: kept.lng,
        source: "kept",
        order: kept.order,
        townCode: row.TOWNCODE,
      };
    }
    const centroid = largestRingCentroid(readPolygonRings(shp, offsets[index]));
    return {
      county,
      district,
      fullName,
      lat: centroid.lat.toFixed(4),
      lng: centroid.lng.toFixed(4),
      source: "centroid",
      order: Number.MAX_SAFE_INTEGER,
      townCode: row.TOWNCODE,
    };
  });

  const seen = new Set(districts.map((district) => district.fullName));
  const orphans = [...existing.keys()].filter((name) => !seen.has(name));
  if (orphans.length > 0) {
    throw new Error(
      `現有表格有 ${orphans.length} 筆在官方界線資料中找不到: ${orphans.join("、")}`,
    );
  }

  const unknownCounty = districts.find(
    (district) => !COUNTY_ORDER.includes(district.county),
  );
  if (unknownCounty) {
    throw new Error(`未列於 COUNTY_ORDER 的縣市: ${unknownCounty.county}`);
  }

  // Counties north to south; inside a county, the rows that were already in the
  // table keep their relative order and the new ones are appended in official
  // TOWNCODE order. That makes the diff purely additive per county group, so a
  // reviewer can see at a glance that no existing coordinate moved — and it keeps
  // TAIWAN_DISTRICT_COORDINATES[0] = 台北市中正區, which several comments cite as
  // the value the old first-hit loop used to badge every saturated article with.
  districts.sort((a, b) => {
    const byCounty =
      COUNTY_ORDER.indexOf(a.county) - COUNTY_ORDER.indexOf(b.county);
    if (byCounty !== 0) return byCounty;
    if (a.order !== b.order) return a.order - b.order;
    return a.townCode.localeCompare(b.townCode);
  });

  const kept = districts.filter((district) => district.source === "kept").length;
  console.log(
    `   保留既有座標 ${kept} 筆，新增面心座標 ${districts.length - kept} 筆`,
  );
  const perCounty = new Map();
  for (const district of districts) {
    perCounty.set(district.county, (perCounty.get(district.county) ?? 0) + 1);
  }
  console.log(
    `   縣市分佈: ${[...perCounty].map(([name, n]) => `${name} ${n}`).join("、")}\n`,
  );

  const lines = [];
  let currentCounty = null;
  for (const district of districts) {
    if (district.county !== currentCounty) {
      if (currentCounty !== null) lines.push("");
      lines.push(`  // ${district.county}`);
      currentCounty = district.county;
    }
    lines.push(
      `  { county: "${district.county}", district: "${district.district}", fullName: "${district.fullName}", lat: ${district.lat}, lng: ${district.lng} },`,
    );
  }
  const rendered = `export const TAIWAN_DISTRICT_COORDINATES: DistrictGeo[] = [\n${lines.join("\n")}\n];\n`;

  if (dryRun) {
    console.log("🔍 --dry-run：未寫入檔案。");
    return;
  }

  const source = readFileSync(TABLE_PATH, "utf8");
  const start = source.indexOf("export const TAIWAN_DISTRICT_COORDINATES");
  const end = source.indexOf("\n];", start);
  if (start < 0 || end < 0) throw new Error("找不到可取代的陣列區段");
  writeFileSync(
    TABLE_PATH,
    source.slice(0, start) + rendered + source.slice(end + 4),
    "utf8",
  );
  console.log(`✅ 已寫入 ${TABLE_PATH}（共 ${districts.length} 筆）`);
}

main().catch((error) => {
  console.error("❌", error);
  process.exit(1);
});
