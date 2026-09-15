#!/usr/bin/env node
/**
 * scripts/import-mohw-ltc-gis.mjs
 *
 * Full-ecosystem ingestion and deduplication script for MOHW Long-Term Care GIS:
 * https://ltcpgis.mohw.gov.tw/
 *
 * Fetches 10 CSV datasets from ltcpgis.mohw.gov.tw:
 *   1. eval.csv               - 機構評鑑結果 (年度、結果、合格效期)
 *   2. res.csv                - 住宿機構 (含開放床數、現有住民、空床計算)
 *   3. ltc.csv                - 長照機構名冊 (居家式/社區式/機構式/綜合式)
 *   4. all.csv                - 長照特約單位 + 巷弄長照站 (A/B/C級, 特約服務項目)
 *   5. g_pi400.csv            - 喘息服務細項代碼 (GA03~GA09)
 *   6. dementia_care.csv      - 失智共同照護中心
 *   7. dementia_service.csv   - 失智社區服務據點
 *   8. caregiver.csv          - 家庭照顧者支持服務據點
 *   9. ccare.csv              - 社區照顧關懷據點
 *  10. hpa.csv                - 國健署預防及延緩失能方案
 *
 * Merging & Deduplication rules:
 *   - Core institutions (all, ltc, res, eval, g_pi400) deduplicated by 機構代碼.
 *   - Base attributes prioritize `all.csv` -> `ltc.csv` -> `res.csv`.
 *   - `service_item` merges all distinct contracted services + institution types.
 *   - `extra_json` enriches with beds/occupancy (openBeds, currentResidents, emptySeats),
 *     ABC level (abcLevel), evaluations (evaluations), and respiteCodes.
 *   - Secondary datasets (dementia, caregiver, ccare, hpa) imported with
 *     facility_type = "long_term_care" and distinct sub-sourceKeys.
 *
 * Usage:
 *   node scripts/import-mohw-ltc-gis.mjs --dry-run
 *   ADMIN_SECRET=<secret> node scripts/import-mohw-ltc-gis.mjs [--clean-obsolete]
 */

const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const CSV_BASE = "https://ltcpgis.mohw.gov.tw/csv/";
const POST_BATCH_SIZE = 2500;

const isDryRun = process.argv.includes("--dry-run");
const shouldCleanObsolete = process.argv.includes("--clean-obsolete");

if (!isDryRun && !ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var. Run with --dry-run to test parsing without submitting.");
  process.exit(1);
}

/**
 * Full-text CSV parser handling quotes, escaped quotes, and newlines within fields.
 */
function parseCsv(text) {
  const cleaned = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (inQuotes) {
      if (char === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r") {
      // skip CR
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
  if (nonEmptyRows.length === 0) return [];
  const headers = nonEmptyRows[0].map((h) => h.trim());
  return nonEmptyRows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((h, i) => (record[h] = (cells[i] ?? "").trim()));
    return record;
  });
}

async function fetchCsv(filename) {
  const url = `${CSV_BASE}${filename}?v=${Math.floor(Math.random() * 999999)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return parseCsv(buffer.toString("utf-8"));
}

const toNum = (s) => {
  if (s === null || s === undefined || s === "") return null;
  const n = parseFloat(String(s).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const cleanPhone = (s) => {
  if (!s) return null;
  const trimmed = s.trim();
  return trimmed === "" || trimmed === "沒有電話號碼" ? null : trimmed;
};

const cleanAddress = (s) => {
  if (!s) return null;
  const trimmed = s.trim();
  return trimmed === "" ? null : trimmed;
};

const LTC_TYPE_MAP = {
  "1": "居家式長照機構",
  "2": "社區式長照機構",
  "3": "機構式長照機構",
  "4": "綜合式長照機構",
};

const RES_TYPE_MAP = {
  "2": "長期照顧服務機構(住宿式)",
  "4": "長期照顧服務機構(住宿式)",
  "A1": "老人福利機構(安養型除外)",
  "A2": "身心障礙福利機構",
  "A3-1": "一般護理之家",
  "A3-2": "精神護理之家",
};

const RESPITE_CODE_MAP = {
  GA03: "日間照顧中心喘息服務-全日",
  GA04: "日間照顧中心喘息服務-半日",
  GA05: "機構住宿式喘息服務",
  GA06: "小規模多機能夜間喘息",
  GA07: "巷弄長照站喘息",
  GA09: "居家喘息",
};

async function buildEcosystemRecords() {
  console.log("Downloading 10 datasets from ltcpgis.mohw.gov.tw...");

  const [
    evalRows,
    resRows,
    gPi400Rows,
    ltcRows,
    allRows,
    dementiaCareRows,
    dementiaServiceRows,
    caregiverRows,
    ccareRows,
    hpaRows,
  ] = await Promise.all([
    fetchCsv("eval.csv"),
    fetchCsv("res.csv"),
    fetchCsv("g_pi400.csv"),
    fetchCsv("ltc.csv"),
    fetchCsv("all.csv"),
    fetchCsv("dementia_care.csv"),
    fetchCsv("dementia_service.csv"),
    fetchCsv("caregiver.csv"),
    fetchCsv("ccare.csv"),
    fetchCsv("hpa.csv"),
  ]);

  console.log(`  eval.csv: ${evalRows.length} rows`);
  console.log(`  res.csv: ${resRows.length} rows`);
  console.log(`  g_pi400.csv: ${gPi400Rows.length} rows`);
  console.log(`  ltc.csv: ${ltcRows.length} rows`);
  console.log(`  all.csv: ${allRows.length} rows`);
  console.log(`  dementia_care.csv: ${dementiaCareRows.length} rows`);
  console.log(`  dementia_service.csv: ${dementiaServiceRows.length} rows`);
  console.log(`  caregiver.csv: ${caregiverRows.length} rows`);
  console.log(`  ccare.csv: ${ccareRows.length} rows`);
  console.log(`  hpa.csv: ${hpaRows.length} rows`);

  // 1. Group eval.csv by 機構代碼
  const evalByCode = new Map();
  for (const r of evalRows) {
    const code = r["機構代碼"];
    if (!code) continue;
    const ev = {
      year: r["評鑑實施年度"] || "",
      result: r["評鑑結果"] || "",
      validUntil: r["評鑑合格效期"] || "",
      start: r["評鑑效期起日"] || "",
      end: r["評鑑效期迄日"] || "",
    };
    const list = evalByCode.get(code) || [];
    list.push(ev);
    evalByCode.set(code, list);
  }

  // 2. Group res.csv by 機構代碼
  const resByCode = new Map();
  for (const r of resRows) {
    const code = r["機構代碼"];
    if (!code) continue;
    const openBeds = toNum(r["開放床數"]);
    const currentResidents = toNum(r["現有住民"]);
    let emptySeats = null;
    if (openBeds !== null && currentResidents !== null) {
      emptySeats = openBeds - currentResidents <= 0 ? "滿床" : openBeds - currentResidents;
    }
    const rawType = r["機構種類"] || r["老福機構種類"];
    const typeLabel = RES_TYPE_MAP[rawType] || rawType || "住宿型機構";

    resByCode.set(code, {
      name: r["機構名稱"],
      address: cleanAddress(r["地址全址"]),
      phone: cleanPhone(r["機構電話"]),
      lat: toNum(r["緯度"]),
      lng: toNum(r["經度"]),
      openBeds,
      currentResidents,
      emptySeats,
      typeLabel,
    });
  }

  // 3. Group g_pi400.csv by O_CODE (機構代碼)
  const respiteByCode = new Map();
  for (const r of gPi400Rows) {
    const code = r["O_CODE"];
    const respiteCode = r["CODE"];
    if (!code || !respiteCode) continue;
    const set = respiteByCode.get(code) || new Set();
    set.add(respiteCode);
    respiteByCode.set(code, set);
  }

  // 4. Group ltc.csv by 機構代碼
  const ltcByCode = new Map();
  for (const r of ltcRows) {
    const code = r["機構代碼"];
    if (!code) continue;
    const rawType = r["機構種類"];
    const typeLabel = LTC_TYPE_MAP[rawType] || (rawType ? `長照機構種類${rawType}` : null);
    ltcByCode.set(code, {
      name: r["機構名稱"],
      address: cleanAddress(r["地址全址"]),
      phone: cleanPhone(r["機構電話"]),
      lat: toNum(r["緯度"]),
      lng: toNum(r["經度"]),
      typeLabel,
    });
  }

  // 5. Group all.csv by 機構代碼
  const allByCode = new Map();
  for (const r of allRows) {
    const code = r["機構代碼"];
    if (!code || !r["機構名稱"]) continue;
    const existing = allByCode.get(code);
    const serviceItem = r["特約服務項目"];
    const abc = r["O_ABC"] || null;

    if (existing) {
      if (serviceItem) existing.serviceItems.add(serviceItem);
      if (abc && !existing.abcLevel) existing.abcLevel = abc;
      continue;
    }

    allByCode.set(code, {
      name: r["機構名稱"],
      address: cleanAddress(r["地址全址"]),
      phone: cleanPhone(r["機構電話"]),
      lat: toNum(r["緯度"]),
      lng: toNum(r["經度"]),
      abcLevel: abc,
      serviceItems: new Set(serviceItem ? [serviceItem] : []),
    });
  }

  // 6. Merge core institutions across allByCode, ltcByCode, resByCode
  const allCoreCodes = new Set([
    ...allByCode.keys(),
    ...ltcByCode.keys(),
    ...resByCode.keys(),
  ]);

  console.log(`Aggregating ${allCoreCodes.size} unique core institution codes...`);

  const coreRecords = [];
  for (const code of allCoreCodes) {
    const all = allByCode.get(code);
    const ltc = ltcByCode.get(code);
    const res = resByCode.get(code);
    const evals = evalByCode.get(code) || [];
    const respiteSet = respiteByCode.get(code);

    const name = all?.name || ltc?.name || res?.name || "";
    const address = all?.address || ltc?.address || res?.address || null;
    const phone = all?.phone || ltc?.phone || res?.phone || null;
    const lat = all?.lat ?? ltc?.lat ?? res?.lat ?? null;
    const lng = all?.lng ?? ltc?.lng ?? res?.lng ?? null;

    // Collect all unique service / type tags
    const serviceSet = new Set();
    if (all?.serviceItems) {
      for (const item of all.serviceItems) serviceSet.add(item);
    }
    if (ltc?.typeLabel) serviceSet.add(ltc.typeLabel);
    if (res?.typeLabel) serviceSet.add(res.typeLabel);
    if (respiteSet) {
      for (const c of respiteSet) {
        if (RESPITE_CODE_MAP[c]) serviceSet.add(RESPITE_CODE_MAP[c]);
      }
    }

    const serviceItemStr = serviceSet.size > 0 ? Array.from(serviceSet).join("、") : null;

    const extra = {};
    if (res?.openBeds !== null && res?.openBeds !== undefined) extra.openBeds = res.openBeds;
    if (res?.currentResidents !== null && res?.currentResidents !== undefined) extra.currentResidents = res.currentResidents;
    if (res?.emptySeats !== null && res?.emptySeats !== undefined) extra.emptySeats = res.emptySeats;
    if (all?.abcLevel) extra.abcLevel = all.abcLevel;
    if (evals.length > 0) extra.evaluations = evals;
    if (respiteSet && respiteSet.size > 0) extra.respiteCodes = Array.from(respiteSet);

    coreRecords.push({
      facilityType: "long_term_care",
      sourceKey: "mohw_ltc_full",
      sourceId: code,
      name,
      address,
      phone,
      lat,
      lng,
      serviceItem: serviceItemStr,
      serviceTime: null,
      dataOrg: "衛福部長照地理資訊系統",
      extra: Object.keys(extra).length > 0 ? extra : undefined,
    });
  }

  console.log(`  Built ${coreRecords.length} core long_term_care institution records.`);

  // 7. Secondary: dementia_care.csv
  const dementiaCareRecords = dementiaCareRows
    .filter((r) => r["共照名稱"])
    .map((r, i) => {
      const code = r["共照編號"] || `dcare_${i + 1}`;
      const services = [];
      if (r["協助就醫診斷"] === "1") services.push("協助就醫診斷");
      if (r["失智照護服務諮詢"] === "1") services.push("失智照護諮詢");
      if (r["轉介失智照護服務"] === "1") services.push("轉介失智照護服務");

      const serviceItem = ["失智共同照護中心", ...services].join("、");

      return {
        facilityType: "long_term_care",
        sourceKey: "mohw_dementia_care",
        sourceId: code,
        name: r["共照名稱"],
        address: cleanAddress(r["共照地址"]),
        phone: cleanPhone(r["共照電話"]),
        lat: toNum(r["緯度"]),
        lng: toNum(r["經度"]),
        serviceItem,
        serviceTime: null,
        dataOrg: "衛福部失智共同照護中心",
        extra: {
          subType: "dementia_care",
          assistDiagnosis: r["協助就醫診斷"] === "1",
          consult: r["失智照護服務諮詢"] === "1",
          referral: r["轉介失智照護服務"] === "1",
        },
      };
    });
  console.log(`  Built ${dementiaCareRecords.length} dementia_care records.`);

  // 8. Secondary: dementia_service.csv
  const dementiaServiceRecords = dementiaServiceRows
    .filter((r) => r["據點名稱"])
    .map((r, i) => {
      const code = r["據點編號"] || `dserv_${i + 1}`;
      const services = [];
      if (r["認知促進及緩和失智"] === "1") services.push("認知促進及緩和失智");
      if (r["安全看視"] === "1") services.push("安全看視");
      if (r["家屬照顧課程"] === "1") services.push("家屬照顧課程");
      if (r["家屬支持團體"] === "1") services.push("家屬支持團體");

      const serviceItem = ["失智社區服務據點", ...services].join("、");

      return {
        facilityType: "long_term_care",
        sourceKey: "mohw_dementia_service",
        sourceId: code,
        name: r["據點名稱"],
        address: cleanAddress(r["據點地址"]),
        phone: cleanPhone(r["據點電話"]),
        lat: toNum(r["緯度"]),
        lng: toNum(r["經度"]),
        serviceItem,
        serviceTime: null,
        dataOrg: "衛福部失智社區服務據點",
        extra: {
          subType: "dementia_service",
          cognitivePromotion: r["認知促進及緩和失智"] === "1",
          safetyWatch: r["安全看視"] === "1",
          caregiverCourse: r["家屬照顧課程"] === "1",
          supportGroup: r["家屬支持團體"] === "1",
        },
      };
    });
  console.log(`  Built ${dementiaServiceRecords.length} dementia_service records.`);

  // 9. Secondary: caregiver.csv
  const caregiverRecords = caregiverRows
    .filter((r) => r["單位"])
    .map((r, i) => {
      const code = `caregiver_${r["序號"] || i + 1}`;
      return {
        facilityType: "long_term_care",
        sourceKey: "mohw_caregiver",
        sourceId: code,
        name: r["單位"],
        address: cleanAddress(r["地址"]),
        phone: cleanPhone(r["電話"]),
        lat: toNum(r["緯度"]),
        lng: toNum(r["經度"]),
        serviceItem: "家庭照顧者支持服務據點",
        serviceTime: null,
        dataOrg: "衛福部家庭照顧者支持服務據點",
        extra: {
          subType: "caregiver",
          serviceDistrict: r["服務區域"] || null,
          serviceObject: r["服務對象"] || null,
          spotType: r["據點類型\n(共融/共融(社))"] || r["據點類型"] || null,
        },
      };
    });
  console.log(`  Built ${caregiverRecords.length} caregiver records.`);

  // 10. Secondary: ccare.csv
  const ccareRecords = ccareRows
    .filter((r) => r["名稱"])
    .map((r, i) => {
      const code = r["代碼"] || `ccare_${r["序號"] || i + 1}`;
      return {
        facilityType: "long_term_care",
        sourceKey: "mohw_ccare",
        sourceId: code,
        name: r["名稱"],
        address: cleanAddress(r["地址"]),
        phone: cleanPhone(r["電話"]),
        lat: toNum(r["緯度"]),
        lng: toNum(r["經度"]),
        serviceItem: "社區照顧關懷據點",
        serviceTime: null,
        dataOrg: "衛福部社區照顧關懷據點",
        extra: {
          subType: "ccare",
          village: r["村里"] || null,
        },
      };
    });
  console.log(`  Built ${ccareRecords.length} ccare records.`);

  // 11. Secondary: hpa.csv
  const hpaRecords = hpaRows
    .filter((r) => r["機構名稱"])
    .map((r, i) => {
      const code = `hpa_prevent_${i + 1}`;
      return {
        facilityType: "long_term_care",
        sourceKey: "mohw_hpa_prevention",
        sourceId: code,
        name: r["機構名稱"],
        address: cleanAddress(r["地址全址"]),
        phone: cleanPhone(r["機構電話"]),
        lat: toNum(r["緯度"]),
        lng: toNum(r["經度"]),
        serviceItem: "預防及延緩失能方案",
        serviceTime: r["聯絡人"] ? `聯絡人：${r["聯絡人"]}` : null,
        dataOrg: "國健署預防及延緩失能方案",
        extra: {
          subType: "hpa",
          contact: r["聯絡人"] || null,
          email: r["電子郵件"] || null,
        },
      };
    });
  console.log(`  Built ${hpaRecords.length} hpa_prevention records.`);

  const allRecords = [
    ...coreRecords,
    ...dementiaCareRecords,
    ...dementiaServiceRecords,
    ...caregiverRecords,
    ...ccareRecords,
    ...hpaRecords,
  ];

  console.log(`Total ecosystem records: ${allRecords.length}`);
  return allRecords;
}

async function submitBatch(records, cleanFacilityType = null) {
  const payload = { records };
  if (cleanFacilityType) {
    payload.cleanFacilityType = cleanFacilityType;
  }

  const res = await fetch(`${BASE_URL}/api/admin/facilities-import`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rss-sync-admin-secret": ADMIN_SECRET,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(`Import batch failed: HTTP ${res.status} ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  const records = await buildEcosystemRecords();

  if (isDryRun) {
    console.log("\n=== DRY RUN SUMMARY ===");
    console.log(`Total records constructed: ${records.length}`);
    const withCoords = records.filter((r) => r.lat !== null && r.lng !== null).length;
    console.log(`Records with coordinates: ${withCoords} (${((withCoords / records.length) * 100).toFixed(1)}%)`);
    const withService = records.filter((r) => r.serviceItem !== null).length;
    console.log(`Records with service items: ${withService} (${((withService / records.length) * 100).toFixed(1)}%)`);
    const withExtra = records.filter((r) => r.extra !== undefined).length;
    console.log(`Records with extra metadata: ${withExtra} (${((withExtra / records.length) * 100).toFixed(1)}%)`);

    console.log("\nSample Core Institution:");
    const sampleCore = records.find((r) => r.sourceKey === "mohw_ltc_full" && r.extra?.evaluations?.length > 0);
    console.log(JSON.stringify(sampleCore, null, 2));

    console.log("\nSample Secondary Record (Dementia):");
    const sampleDementia = records.find((r) => r.sourceKey === "mohw_dementia_care");
    console.log(JSON.stringify(sampleDementia, null, 2));

    console.log("\nDry run completed successfully. No data was sent.");
    return;
  }

  console.log(`\nImporting ${records.length} records in batches of ${POST_BATCH_SIZE}...`);
  if (shouldCleanObsolete) {
    console.log("Will request cleaning obsolete 'ltc_contracted' records in first batch.");
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalDeleted = 0;

  for (let i = 0; i < records.length; i += POST_BATCH_SIZE) {
    const batch = records.slice(i, i + POST_BATCH_SIZE);
    const cleanType = i === 0 && shouldCleanObsolete ? "ltc_contracted" : null;
    const batchNum = Math.floor(i / POST_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(records.length / POST_BATCH_SIZE);

    console.log(`Submitting batch ${batchNum}/${totalBatches} (${batch.length} records)...`);
    const res = await submitBatch(batch, cleanType);
    totalInserted += res.inserted || 0;
    totalUpdated += res.updated || 0;
    if (res.deleted) totalDeleted += res.deleted;
    console.log(`  Batch ${batchNum} done: inserted=${res.inserted} updated=${res.updated}${res.deleted ? ` deleted=${res.deleted}` : ""}`);
  }

  console.log(`\nImport finished!`);
  console.log(`  Total inserted: ${totalInserted}`);
  console.log(`  Total updated: ${totalUpdated}`);
  if (totalDeleted > 0) console.log(`  Total obsolete deleted: ${totalDeleted}`);
}

main().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
