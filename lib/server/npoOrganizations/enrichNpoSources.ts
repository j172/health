import "server-only";
import * as cheerio from "cheerio";
import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeOrgName, cleanWebsiteUrl } from "./npoUtils";
import type { NpoTrustBadge } from "./queries";

export interface EnrichNpoSourcesResult {
  ok: boolean;
  yahooTotal: number;
  npoChannelTotal: number;
  blog104Total: number;
  enrichedCount: number;
}

interface SourceOrg {
  name: string;
  sourceKey: "yahoo_charity" | "npo_channel" | "104_recommended";
  badgeLabel: string;
  url?: string;
  note?: string;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchHtmlWithRetry(url: string, retries = 2): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const { status, text } = await httpGetText(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        timeoutMs: 12_000,
      });
      if (status >= 200 && status < 300) return text;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await delay(500 * (attempt + 1));
    }
  }
  throw new Error(`Failed to fetch ${url}`);
}

async function fetchYahooOrgs(): Promise<SourceOrg[]> {
  const orgs: SourceOrg[] = [];
  const maxPages = 10;

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url =
        page === 1
          ? "https://tw.charity.yahoo.com/org_list.html"
          : `https://tw.charity.yahoo.com/org_list.html?page=${page}`;
      const html = await fetchHtmlWithRetry(url);
      const $ = cheerio.load(html);

      let foundOnPage = 0;
      $("a[href*='org_project']").each((_, el) => {
        const name = $(el).text().trim();
        const href = $(el).attr("href") || "";
        if (name) {
          const fullUrl = href.startsWith("http")
            ? href
            : `https://tw.charity.yahoo.com/${href.replace(/^\//, "")}`;
          orgs.push({
            name,
            sourceKey: "yahoo_charity",
            badgeLabel: "Yahoo! 公益合作機構",
            url: fullUrl,
          });
          foundOnPage++;
        }
      });

      if (foundOnPage === 0) break;
      await delay(200);
    } catch {
      break;
    }
  }
  return orgs;
}

async function fetchNpoChannelOrgs(): Promise<SourceOrg[]> {
  const orgs: SourceOrg[] = [];
  try {
    const html = await fetchHtmlWithRetry("https://www.npochannel.net/NpoComp");
    const $ = cheerio.load(html);

    $("a[href*='NpoInfo']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      const parentText = $(el).parent().text().trim();
      const imgAlt = $(el).find("img").attr("alt") || "";
      const name = text || imgAlt || parentText.split("\n")[0].trim();

      if (name && name.length >= 3) {
        const fullUrl = href.startsWith("http")
          ? href
          : `https://www.npochannel.net${href.startsWith("/") ? href : `/${href}`}`;
        orgs.push({
          name,
          sourceKey: "npo_channel",
          badgeLabel: "NPO Channel 夥伴",
          url: fullUrl,
        });
      }
    });
  } catch (err) {
    console.warn("[Enrich NPO] NPO Channel fetch failed:", err);
  }
  return orgs;
}

async function fetch104BlogOrgs(): Promise<SourceOrg[]> {
  const orgs: SourceOrg[] = [];
  try {
    const html = await fetchHtmlWithRetry("https://blog.104.com.tw/charity-donations-taiwan/");
    const $ = cheerio.load(html);

    $("table tr").each((_, el) => {
      const cells = $(el)
        .find("td")
        .map((__, td) => $(td).text().trim())
        .get();
      if (cells.length >= 2) {
        const name = cells[0];
        const note = cells[1] || undefined;
        if (name && name.length >= 3 && !name.includes("機構名稱") && !name.includes("團體名稱")) {
          orgs.push({
            name,
            sourceKey: "104_recommended",
            badgeLabel: "104 嚴選捐款名冊",
            url: "https://blog.104.com.tw/charity-donations-taiwan/",
            note,
          });
        }
      }
    });
  } catch (err) {
    console.warn("[Enrich NPO] 104 blog fetch failed:", err);
  }
  return orgs;
}

export async function enrichNpoOrganizations(): Promise<EnrichNpoSourcesResult> {
  const [yahooOrgs, npoChannelOrgs, blog104Orgs] = await Promise.all([
    fetchYahooOrgs(),
    fetchNpoChannelOrgs(),
    fetch104BlogOrgs(),
  ]);

  const allSourceOrgs: SourceOrg[] = [...yahooOrgs, ...npoChannelOrgs, ...blog104Orgs];
  let enrichedCount = 0;

  await withConnection(async (conn) => {
    // Load existing NPOs, tax organizations, and disability welfare facilities
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, name, extra_json, website FROM facilities WHERE facility_type IN ('npo', 'tax_organization', 'disability_welfare')`,
    );

    // Build index by exact name and normalized name
    const idByNormName = new Map<string, RowDataPacket>();
    const idByName = new Map<string, RowDataPacket>();

    for (const row of rows) {
      idByName.set(row.name, row);
      const norm = normalizeOrgName(row.name);
      if (norm) {
        idByNormName.set(norm, row);
      }
    }

    const updatesToApply = new Map<
      number,
      {
        row: RowDataPacket;
        badges: NpoTrustBadge[];
        certifications: Set<string>;
        website?: string | null;
        note?: string;
      }
    >();

    for (const src of allSourceOrgs) {
      const normSrc = normalizeOrgName(src.name);
      const matchedRow =
        idByName.get(src.name) ||
        (normSrc ? idByNormName.get(normSrc) : undefined) ||
        // Fuzzy sub-string match for orgs with length >= 5
        (normSrc && normSrc.length >= 5
          ? Array.from(idByNormName.entries()).find(
              ([k]) => k.includes(normSrc) || normSrc.includes(k),
            )?.[1]
          : undefined);

      if (!matchedRow) continue;

      let entry = updatesToApply.get(matchedRow.id);
      if (!entry) {
        let existingBadges: NpoTrustBadge[] = [];
        let existingCerts: string[] = [];
        try {
          const extra =
            typeof matchedRow.extra_json === "string"
              ? JSON.parse(matchedRow.extra_json)
              : matchedRow.extra_json;
          if (Array.isArray(extra?.trustBadges)) existingBadges = [...extra.trustBadges];
          if (Array.isArray(extra?.certifications)) existingCerts = [...extra.certifications];
        } catch {}

        entry = {
          row: matchedRow,
          badges: existingBadges,
          certifications: new Set(existingCerts),
          website: matchedRow.website,
        };
        updatesToApply.set(matchedRow.id, entry);
      }

      if (!entry.certifications.has(src.sourceKey)) {
        entry.certifications.add(src.sourceKey);
        entry.badges.push({
          id: src.sourceKey,
          label: src.badgeLabel,
          url: src.url,
        });
      }

      if (!entry.website && src.url) {
        const clean = cleanWebsiteUrl(src.url);
        if (clean) entry.website = clean;
      }

      if (src.note && !entry.note) {
        entry.note = src.note;
      }
    }

    // Apply updates
    for (const [id, data] of updatesToApply.entries()) {
      let extra: Record<string, unknown> = {};
      try {
        extra =
          typeof data.row.extra_json === "string"
            ? JSON.parse(data.row.extra_json)
            : data.row.extra_json || {};
      } catch {}

      extra.trustBadges = data.badges;
      extra.certifications = Array.from(data.certifications);
      if (data.note && !extra.productNote && !extra.purpose) {
        extra.purpose = data.note;
      }

      await conn.query(
        `UPDATE facilities SET extra_json = ?, website = COALESCE(?, website), updated_at = NOW() WHERE id = ?`,
        [JSON.stringify(extra), data.website || null, id],
      );
      enrichedCount++;
    }
  });

  return {
    ok: true,
    yahooTotal: yahooOrgs.length,
    npoChannelTotal: npoChannelOrgs.length,
    blog104Total: blog104Orgs.length,
    enrichedCount,
  };
}
