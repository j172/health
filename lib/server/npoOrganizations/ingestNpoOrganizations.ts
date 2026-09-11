import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { httpGetText } from "@/lib/server/net/httpClient";
import {
  normalizeOrgName,
  extractNpoDetailFields,
  parseListPage,
  type ParsedNpoDetail,
} from "./npoUtils";

export interface IngestNpoOptions {
  startPage?: number;
  maxPages?: number;
}

export interface IngestNpoResult {
  ok: boolean;
  startPage: number;
  pagesProcessed: number;
  totalPages: number;
  totalProcessed: number;
  totalInserted: number;
  totalEnriched: number;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const { status, text } = await httpGetText(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; TaiwanHealthInfoBot/1.0; +https://health.j172.tw)",
        },
        timeoutMs: 15_000,
      });
      if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
      return text;
    } catch (err) {
      if (i === retries - 1) throw err;
      await delay(1000 * (i + 1));
    }
  }
  throw new Error("Failed to fetch after retries");
}

export async function ingestNpoOrganizations({
  startPage = 1,
  maxPages = 5,
}: IngestNpoOptions = {}): Promise<IngestNpoResult> {
  let totalProcessed = 0;
  let totalInserted = 0;
  let totalEnriched = 0;
  let platformTotalPages = 1;
  let pagesProcessed = 0;

  await withConnection(async (conn) => {
    for (let page = startPage; page < startPage + maxPages; page++) {
      pagesProcessed++;
      const pageUrl = `https://www.npo.org.tw/npolist.aspx?nowPage=${page}&tid=146`;

      let listHtml = "";
      try {
        listHtml = await fetchWithRetry(pageUrl);
      } catch (err) {
        console.warn(`[NPO Sync] Failed to fetch page ${page}:`, err);
        break;
      }

      const { items, totalPages } = parseListPage(listHtml);
      platformTotalPages = totalPages;

      if (items.length === 0) {
        break;
      }

      for (const item of items) {
        totalProcessed++;
        await delay(150); // Polite rate limit

        const detailUrl = `https://www.npo.org.tw/orgnpointroduction.aspx?tid=200&orgid=${item.orgid}`;
        let detail: ParsedNpoDetail;
        try {
          const detailHtml = await fetchWithRetry(detailUrl);
          detail = extractNpoDetailFields(detailHtml, item.orgid);
        } catch {
          detail = {
            orgid: item.orgid,
            name: item.name,
            orgAttribute: item.orgAttribute,
            serviceArea: item.serviceArea,
            address: null,
            city: null,
            phone: null,
            fax: null,
            email: null,
            website: null,
            contact: null,
            president: null,
            founder: null,
            establishDate: null,
            permissionAuthority: null,
            purpose: null,
            workFocus: null,
            serviceItems: null,
          };
        }

        const orgName = detail.name || item.name;
        const normalizedName = normalizeOrgName(orgName);
        const physicalAddress = detail.address || null;
        const finalCity = detail.city || item.serviceArea || "全台灣";

        // 1. Check if an NPO with same source_id (orgid) already exists
        const [existingNpo] = await conn.query<RowDataPacket[]>(
          "SELECT id, name, address, extra_json FROM facilities WHERE source_key = 'npo_tw' AND source_id = ? LIMIT 1",
          [item.orgid],
        );

        const extraData = {
          orgid: item.orgid,
          orgCode: item.orgCode,
          orgAttribute: detail.orgAttribute || item.orgAttribute,
          website: detail.website || null,
          email: detail.email || null,
          contact: detail.contact || null,
          president: detail.president || null,
          founder: detail.founder || null,
          purpose: detail.purpose || null,
          workFocus: detail.workFocus || null,
          serviceArea: detail.serviceArea || item.serviceArea,
          city: finalCity,
        };

        if (existingNpo.length > 0) {
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

        // 2. Check if an existing tax_organization matches
        let matchedTaxRow: RowDataPacket | null = null;
        if (normalizedName.length >= 4) {
          const [taxRows] = await conn.query<RowDataPacket[]>(
            "SELECT id, name, address, phone, extra_json FROM facilities WHERE facility_type = 'tax_organization' AND name LIKE ? LIMIT 5",
            [`%${normalizedName.slice(0, 5)}%`],
          );

          for (const taxRow of taxRows) {
            const taxNormalized = normalizeOrgName(taxRow.name);
            if (
              taxNormalized === normalizedName ||
              taxNormalized.includes(normalizedName) ||
              normalizedName.includes(taxNormalized)
            ) {
              matchedTaxRow = taxRow;
              break;
            }
          }
        }

        if (matchedTaxRow) {
          let existingExtra = {};
          try {
            existingExtra =
              typeof matchedTaxRow.extra_json === "string"
                ? JSON.parse(matchedTaxRow.extra_json)
                : matchedTaxRow.extra_json || {};
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
          // Insert fresh NPO record
          await conn.query(
            `INSERT INTO facilities (
              facility_type, source_key, source_id, name, address, phone,
              service_item, data_org, extra_json, synced_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
            [
              "npo",
              "npo_tw",
              item.orgid,
              orgName,
              physicalAddress || finalCity,
              detail.phone,
              detail.serviceItems || detail.orgAttribute || item.orgAttribute,
              "台灣公益資訊中心",
              JSON.stringify(extraData),
            ],
          );
          totalInserted++;
        }
      }
    }
  });

  return {
    ok: true,
    startPage,
    pagesProcessed,
    totalPages: platformTotalPages,
    totalProcessed,
    totalInserted,
    totalEnriched,
  };
}
