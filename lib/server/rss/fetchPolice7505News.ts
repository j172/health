import { z } from "zod";
import type { EnrichedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parseCsv } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import { parseTaipeiDateToUtc } from "@/lib/server/rss/time";
import { sha256 } from "@/lib/server/rss/scraperUtils";

// ---------------------------------------------------------------------------
// 內政部警政署「各警察機關新聞發布」— data.gov.tw dataset 7505 (issue #568 /
// spec #562). A CSV dump (not RSS/XML), updated daily per spec research
// (~1,061 real rows confirmed live 2026-10-14, newest postDate 2026-10-11).
// Columns: serialNo（序號）, stitle（主旨）, deptName（發布機關）,
// postDate（張貼日）, content（內文，full article text）.
//
// Two upstream quirks confirmed against a real downloaded sample, not
// assumed:
//
// 1. The CSV carries a second "header" row right after the real one — the
//    same five columns' Chinese display labels ("序號,主旨,發布機關,張貼日,
//    內文") parsed by `parseCsv` as if it were a data row. Filtered out
//    below by requiring `serialNo` to parse as a plain integer.
// 2. `content` embeds literal newlines inside the quoted CSV field (a
//    multi-paragraph press release), which a naive split-on-"\n" parser
//    would corrupt into extra bogus rows — this is exactly what
//    `lib/server/facilities/csv.ts`'s whole-text-stream `parseCsv` already
//    exists to handle (same problem as some MOHW exports), so it's reused
//    here rather than writing a second CSV parser.
//
// `serialNo` is NOT used as this source's identity key: it reads as a
// position-in-list counter (newest = 1, counting up as items get older),
// so a re-download after one new article is added would renumber every
// existing row by +1. Using it as `external_id` would make
// `persistItems.ts` treat every row as "changed" every single day, and
// worse, could silently overwrite a *different* article that happened to
// land on the same serialNo on a later day (news_items' unique key is keyed
// on external_id, not on content). `deptName + postDate + stitle` is this
// dataset's actual natural key — a given department does not publish two
// different press releases with the identical title at the identical
// timestamp — so the identity hash is built from those three fields instead.
//
// The dataset also carries no per-article URL of its own (no link field in
// the CSV). `canonical_url` is therefore synthesized as the data.gov.tw
// dataset landing page plus a per-article query tag — see
// DATASET_LANDING_URL below. This still has to be unique per row (not one
// shared constant for all ~1,061 rows): news_items has a second unique key
// on (source_name, canonical_url), and a shared URL across every row of
// this source would make the 2nd+ article upsert collide with and overwrite
// the 1st article's row.
// ---------------------------------------------------------------------------

const FEED_CODE = "police_7505_news" as const;
const SOURCE_NAME = "police_7505";
const FEED_NAME = "警政署－各警察機關新聞發布";
const DATASET_LANDING_URL = "https://data.gov.tw/dataset/7505";
const CSV_URL =
  "https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/00F7F1C4-2AC0-461C-B060-A6FCD3FF6E45/resource/183CE354-DE3C-4274-BDC3-3F60CCE8BD0B/download";

interface Police7505Raw {
  serialNo: string;
  stitle: string;
  deptName: string;
  postDate: string;
  content: string;
}

/**
 * Critical-field schema — same convention as police176455RawSchema
 * (lib/server/antiFraud/sources/police176455.ts): `.nullable()` on every
 * field this ingestion actually depends on, so a column rename/removal
 * upstream fails loudly instead of quietly landing nulls in MySQL.
 */
export const police7505RawSchema = z.object({
  serialNo: z.string().nullable(),
  stitle: z.string().nullable(),
  deptName: z.string().nullable(),
  postDate: z.string().nullable(),
  content: z.string().nullable(),
});

/** Pure CSV parser — no network. */
export const parsePolice7505Csv = (csvText: string): EnrichedRssItem[] => {
  const rows = parseCsv(csvText) as unknown as Police7505Raw[];
  validateImportRows("警政署 7505 各警察機關新聞發布", police7505RawSchema, rows);

  const items: EnrichedRssItem[] = [];

  for (const row of rows) {
    // Drops the Chinese-label artifact row (serialNo="序號") — see module
    // comment. A real row's serialNo is always a plain positive integer.
    if (!/^\d+$/.test((row.serialNo ?? "").trim())) continue;

    const title = (row.stitle ?? "").trim();
    const deptName = (row.deptName ?? "").trim() || null;
    const content = (row.content ?? "").trim();
    const postDate = (row.postDate ?? "").trim();
    if (!title || !content) continue;

    const publishedAtUtc = parseTaipeiDateToUtc(postDate);

    const identityHash = sha256(`${deptName ?? ""}|${postDate}|${title}`).slice(0, 20);
    const externalId = `police7505_${identityHash}`;
    const canonicalUrl = `${DATASET_LANDING_URL}?article=${identityHash}`;

    const detailHtml = content
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${line}</p>`)
      .join("");
    const detailText = content.replace(/\s+/g, " ").trim();
    const descriptionText =
      detailText.length > 200 ? `${detailText.slice(0, 200).trim()}…` : detailText;

    const payloadHash = sha256(
      JSON.stringify({ title, deptName, content, publishedAtUtc: publishedAtUtc?.toISOString() ?? null }),
    );

    items.push({
      sourceName: SOURCE_NAME,
      feedCode: FEED_CODE,
      feedName: FEED_NAME,
      externalId,
      canonicalUrl,
      sourceUrl: canonicalUrl,
      title,
      descriptionHtml: descriptionText ? `<p>${descriptionText}</p>` : "",
      descriptionText,
      detailHtml: detailHtml || null,
      detailText: detailText || null,
      deptName,
      categoryRaw: null,
      displayType: null,
      publishedAtUtc,
      publicBeginAtTaipei: null,
      publicEndAtTaipei: null,
      payloadHash,
      assets: [],
      // SEO metadata is filled in by generateSeoMetadataWithAi in
      // runIngestion.ts, same as every other special source.
      metaTitle: "",
      metaDescription: "",
      keywords: "",
      geoSummary: "",
    });
  }

  return items;
};

export interface Police7505FetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

export const fetchPolice7505News = async (): Promise<Police7505FetchResult> => {
  let httpStatus: number | null = null;

  try {
    const response = await httpGetText(CSV_URL, {
      headers: {
        "User-Agent": "health.j172.tw-rss-ingestor/1.0",
        Accept: "text/csv,application/octet-stream;q=0.9,*/*;q=0.8",
      },
      timeoutMs: 30_000,
    });
    httpStatus = response.status;

    if (response.status < 200 || response.status >= 300) {
      return {
        ok: false,
        httpStatus: response.status,
        itemCount: 0,
        items: [],
        errorMessage: `警政署 7505 各警察機關新聞發布 HTTP ${response.status}`,
      };
    }

    const items = parsePolice7505Csv(response.text);

    return {
      ok: true,
      httpStatus,
      itemCount: items.length,
      items,
      errorMessage: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown 警政署 7505 新聞 fetch error";
    return {
      ok: false,
      httpStatus,
      itemCount: 0,
      items: [],
      errorMessage: message,
    };
  }
};
