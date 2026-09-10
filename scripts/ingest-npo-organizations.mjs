#!/usr/bin/env node
/**
 * Ingests NPO directory from Taiwan NPO Information Platform (https://www.npo.org.tw/npolist.aspx?tid=146).
 * Performs dual-stage deduplication against existing facilities, extracts physical addresses,
 * enriches contact & website URLs, and prepares records for TGOS batch geocoding.
 *
 * Usage:
 *   node scripts/ingest-npo-organizations.mjs [--max-pages=5] [--start-page=1] [--dry-run]
 */

import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(path.resolve(__dirname, "../.env"));
  } catch {}
}

const CHECKPOINT_FILE = path.resolve(__dirname, "../.npo-checkpoint.json");

// CLI arguments
const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const prefix = `--${name}=`;
  const match = args.find((a) => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
};

const MAX_PAGES = Number(getArg("max-pages", "5"));
const START_PAGE = Number(getArg("start-page", "1"));
const DRY_RUN = args.includes("--dry-run");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function normalizeOrgName(name) {
  if (!name) return "";
  let clean = name.trim();
  clean = clean
    .replace(/^(社團法人|財團法人|社團|財團)/g, "")
    .replace(/^(中華民國|台灣省|臺灣省|台灣|臺灣|台北市|臺北市|新北市|高雄市|台中市|臺中市|台南市|臺南市|桃園市)/g, "")
    .replace(/^(社團法人|財團法人)/g, "")
    .replace(/[（\(][^）\)]*[）\)]/g, "")
    .replace(/[\s\-_—·・，,。.：:;；()（）\[\]【】「」『』]/g, "");
  return clean.toLowerCase();
}

export function cleanWebsiteUrl(rawUrl) {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed.length < 4 ||
    /^(無|暫無|無網站|暫無網站|同上|無提供|尚無|未知|none|null|nil|n\/a|na|#)$/i.test(trimmed) ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("mailto:")
  ) {
    return null;
  }

  let normalized = trimmed;
  if (!/^https?:\/\//i.test(normalized)) {
    if (normalized.includes(".") && !normalized.includes(" ")) {
      normalized = `https://${normalized}`;
    } else {
      return null;
    }
  }

  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (!parsed.hostname.includes(".")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await delay(500 * attempt);
    }
  }
}

export function parseListPage(html) {
  const $ = cheerio.load(html);
  const items = [];

  $("table tr").each((_, el) => {
    const onclick = $(el).attr("onclick") || "";
    const match = onclick.match(/orgid=(\d+)/);
    if (!match) return;

    const orgid = match[1];
    const tds = $(el).find("td");
    if (tds.length < 4) return;

    const orgCode = $(tds[0]).text().trim();
    const orgAttribute = $(tds[1]).text().trim();
    const name = $(tds[2]).text().trim();
    const serviceArea = $(tds[3]).text().trim();

    items.push({
      orgid,
      orgCode,
      orgAttribute,
      name,
      serviceArea,
    });
  });

  // Find max page
  let totalPages = 1;
  $("a[href*='nowPage']").each((_, a) => {
    const href = $(a).attr("href") || "";
    const m = href.match(/nowPage=(\d+)/);
    if (m) {
      const p = Number(m[1]);
      if (p > totalPages) totalPages = p;
    }
  });

  return { items, totalPages };
}

export function parseDetailPage(html, orgid) {
  const $ = cheerio.load(html);
  const text = $("body").text();

  const getField = (label) => {
    let found = null;
    $("tr, div, li, p, span").each((_, el) => {
      if (found) return;
      const t = $(el).text().replace(/[ \t]+/g, " ").trim();
      const regex = new RegExp(`^${label}[：:\\s]+(.+)$`, "m");
      const match = t.match(regex);
      if (match && match[1]) {
        const val = match[1].trim();
        if (val.length > 0 && val.length < 500) {
          found = val;
        }
      }
    });
    if (found) return found;

    const regex = new RegExp(`${label}[：:\\s]+([^\\r\\n]+)`, "i");
    const m = text.match(regex);
    if (m && m[1]) {
      const v = m[1].replace(/[ \t]+/g, " ").trim();
      if (v.length > 0 && v.length < 300) return v;
    }
    return null;
  };

  const name =
    getField("機構名稱") ||
    $("h1, h2, h3, .title, .org-title").first().text().trim() ||
    `NPO-${orgid}`;
  const phone = getField("電話") || getField("聯絡電話");
  const fax = getField("傳真");
  const email = getField("電子郵件") || getField("Email");

  // Website can be in text after 網址： or in an external <a> tag
  let website = null;
  const webMatch = text.match(/網址[：:\s]+(https?:\/\/[^\s\r\n<"']+)/i);
  if (webMatch && webMatch[1]) {
    website = cleanWebsiteUrl(webMatch[1]);
  }

  if (!website) {
    $("tr, div, li, p").each((_, el) => {
      if (website) return;
      const t = $(el).text().replace(/[ \t]+/g, " ").trim();
      if (t.includes("網址")) {
        $(el).find("a").each((_, a) => {
          if (website) return;
          const href = $(a).attr("href");
          if (
            href &&
            !href.includes("npo.org.tw") &&
            !href.includes("npotw") &&
            !href.includes("npois_tw") &&
            !href.includes(".aspx")
          ) {
            website = cleanWebsiteUrl(href);
          }
        });
        if (!website) {
          const raw = getField("網址");
          website = cleanWebsiteUrl(raw);
        }
      }
    });
  }

  const address = getField("地址");
  const contact = getField("聯絡人");
  const president = getField("執行長") || getField("理事長") || getField("董事長");
  const founder = getField("創辦人");
  const establishDate = getField("成立日期");
  const permissionAuthority = getField("許可機關");
  const orgAttribute = getField("機構屬性");
  const purpose = getField("成立主旨");
  const workFocus = getField("工作重點");
  const serviceArea = getField("服務區域");
  const serviceItems = getField("服務項目");

  let city = null;
  if (address) {
    const cityMatch = address.match(/(臺北市|台北市|新北市|基隆市|桃園市|新竹市|新竹縣|苗栗縣|臺中市|台中市|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|臺南市|台南市|高雄市|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)/);
    if (cityMatch) {
      city = cityMatch[1].replace("台", "臺");
    }
  }

  return {
    orgid,
    name,
    phone,
    fax,
    email,
    website,
    address,
    city,
    contact,
    president,
    founder,
    establishDate,
    permissionAuthority,
    orgAttribute,
    purpose,
    workFocus,
    serviceArea,
    serviceItems,
  };
}

async function main() {
  console.log(`[NPO Ingest] Starting ingestion. Max pages: ${MAX_PAGES}, Start page: ${START_PAGE}, Dry run: ${DRY_RUN}`);

  let conn = null;
  if (!DRY_RUN) {
    conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      ssl: process.env.MYSQL_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
    console.log("[NPO Ingest] Connected to MySQL database.");
  }

  let totalProcessed = 0;
  let totalInserted = 0;
  let totalEnriched = 0;

  try {
    for (let page = START_PAGE; page < START_PAGE + MAX_PAGES; page++) {
      const pageUrl = `https://www.npo.org.tw/npolist.aspx?nowPage=${page}&tid=146`;
      console.log(`\n[Page ${page}] Fetching list: ${pageUrl}`);

      const listHtml = await fetchWithRetry(pageUrl);
      const { items, totalPages } = parseListPage(listHtml);
      console.log(`[Page ${page}] Found ${items.length} NPO items. (Platform total pages: ${totalPages})`);

      if (items.length === 0) {
        console.log(`[Page ${page}] No more items found. Finishing.`);
        break;
      }

      for (const item of items) {
        totalProcessed++;
        await delay(200); // Polite rate limiting

        const detailUrl = `https://www.npo.org.tw/orgnpointroduction.aspx?tid=200&orgid=${item.orgid}`;
        let detail = null;
        try {
          const detailHtml = await fetchWithRetry(detailUrl);
          detail = parseDetailPage(detailHtml, item.orgid);
        } catch (err) {
          console.warn(`[Org ${item.orgid}] Failed to fetch detail: ${err.message}`);
          detail = {
            orgid: item.orgid,
            name: item.name,
            orgAttribute: item.orgAttribute,
            serviceArea: item.serviceArea,
            address: null,
            phone: null,
            website: null,
          };
        }

        const orgName = detail.name || item.name;
        const normalizedName = normalizeOrgName(orgName);
        const physicalAddress = detail.address || null;
        const finalCity = detail.city || item.serviceArea || "全台灣";
        const website = detail.website || null;
        const websiteSource = website ? "official" : null;

        if (DRY_RUN) {
          console.log(`[DRY-RUN] Org ${item.orgid}: ${orgName} | City: ${finalCity} | Addr: ${physicalAddress || "無"} | Web: ${website || "無"}`);
          continue;
        }

        // Dual-stage deduplication:
        // 1. Check if org already exists by source_key and source_id
        const [existingNpo] = await conn.query(
          "SELECT id, address, phone, extra_json FROM facilities WHERE source_key = 'npo_tw' AND source_id = ?",
          [String(item.orgid)],
        );

        const extraData = {
          orgid: item.orgid,
          orgCode: item.orgCode,
          orgAttribute: detail.orgAttribute || item.orgAttribute,
          website,
          websiteSource,
          email: detail.email || null,
          contact: detail.contact || detail.president || null,
          founder: detail.founder || null,
          purpose: detail.purpose || null,
          workFocus: detail.workFocus || null,
          serviceArea: detail.serviceArea || item.serviceArea,
          permissionAuthority: detail.permissionAuthority || null,
          city: finalCity,
        };

        if (existingNpo.length > 0) {
          // Update existing NPO record
          const row = existingNpo[0];
          await conn.query(
            `UPDATE facilities SET
              name = ?,
              address = COALESCE(?, address),
              phone = COALESCE(?, phone),
              service_item = ?,
              extra_json = ?,
              synced_at = NOW(),
              updated_at = NOW()
             WHERE id = ?`,
            [
              orgName,
              physicalAddress,
              detail.phone,
              detail.serviceItems || detail.orgAttribute || item.orgAttribute,
              JSON.stringify(extraData),
              row.id,
            ],
          );
          totalEnriched++;
          continue;
        }

        // 2. Check if there is an existing tax_organization matching by normalized name and city
        let matchedTaxRow = null;
        if (normalizedName.length >= 4) {
          const [taxRows] = await conn.query(
            "SELECT id, name, address, phone, extra_json FROM facilities WHERE facility_type = 'tax_organization' AND name LIKE ? LIMIT 5",
            [`%${normalizedName.slice(0, 6)}%`],
          );

          for (const taxRow of taxRows) {
            const taxNormalized = normalizeOrgName(taxRow.name);
            if (taxNormalized === normalizedName || taxNormalized.includes(normalizedName) || normalizedName.includes(taxNormalized)) {
              matchedTaxRow = taxRow;
              break;
            }
          }
        }

        if (matchedTaxRow) {
          // Enrich existing tax_organization
          let existingExtra = {};
          try {
            existingExtra = typeof matchedTaxRow.extra_json === "string" ? JSON.parse(matchedTaxRow.extra_json) : matchedTaxRow.extra_json || {};
          } catch {}

          const mergedExtra = {
            ...existingExtra,
            ...extraData,
            enrichedFromNpoCenter: true,
            npoCenterOrgid: item.orgid,
          };

          await conn.query(
            `UPDATE facilities SET
              address = COALESCE(?, address),
              phone = COALESCE(?, phone),
              extra_json = ?,
              synced_at = NOW(),
              updated_at = NOW()
             WHERE id = ?`,
            [physicalAddress, detail.phone, JSON.stringify(mergedExtra), matchedTaxRow.id],
          );
          totalEnriched++;
        } else {
          // Insert as fresh NPO record
          await conn.query(
            `INSERT INTO facilities (
              facility_type, source_key, source_id, name, address, phone,
              lat, lng, service_item, service_time, data_org, extra_json,
              synced_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
            [
              "npo",
              "npo_tw",
              String(item.orgid),
              orgName,
              physicalAddress || finalCity,
              detail.phone || null,
              null, // lat (to be populated by TGOS batch geocoding)
              null, // lng
              detail.serviceItems || detail.orgAttribute || item.orgAttribute,
              detail.establishDate ? `成立日期：${detail.establishDate}` : null,
              "台灣公益資訊中心",
              JSON.stringify(extraData),
            ],
          );
          totalInserted++;
        }
      }

      console.log(`[Page ${page}] Completed. Cumulative Processed: ${totalProcessed}, Inserted: ${totalInserted}, Enriched: ${totalEnriched}`);
      if (page >= totalPages) break;
    }

    console.log(`\n[NPO Ingest] Finished successfully. Total processed: ${totalProcessed}, Inserted: ${totalInserted}, Enriched: ${totalEnriched}`);
  } catch (err) {
    console.error(`[NPO Ingest] Fatal error:`, err);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
}

// Only execute main if run directly as script
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
