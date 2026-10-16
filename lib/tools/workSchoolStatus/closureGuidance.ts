/**
 * 天然災害停止上班及上課情形 — what this site does and does not do (issue #691).
 *
 * DECISION (investigated 2026-10-16, details in the PR that introduced this
 * file): this site shows NO per-county 停班停課 status. It links to the official
 * announcement and says why. Showing a county as "停止上班" or "照常上班" is a
 * safety-relevant claim, so it needs a source that is both official and stable
 * enough to read by machine without ever being silently wrong. There is none:
 *
 * - www.dgpa.gov.tw/typh/daily/nds.html is server-rendered HTML with no public
 *   JSON/XML/CAP behind it (`ndsdata.json`, `nds.json`, `nds.xml`, `ndsdata.xml`,
 *   `nds.js` are all 404; the page's only script is Google Tag Manager). Its
 *   table layout has alternated between at least two templates since 2024 (a
 *   flat per-county table, and a region-grouped table using rowspan with new
 *   wording such as 「已達停止上班及上課標準」/「尚未列入警戒區」), and the quiet-day
 *   state is a different single-row layout again — the "scrape a table that
 *   will silently break" shape the owner ruled out.
 * - The CAP feed that data.gov.tw 20457 points at
 *   (`alerts.ncdr.nat.gov.tw/RssAtomFeed.ashx?AlertType=33`) answers
 *   「請先登入會員」 — it needs an NCDR member login, so it is not public.
 * - The public NCDR feed (`RssAtomFeed.ashx`, no AlertType) did not carry any
 *   停班停課 entry or category when checked (it lists CWA earthquake, wind and
 *   heat bulletins).
 *
 * So: link-only guidance, honest copy, and never a cached or guessed status.
 * If a stable, public, machine-readable source appears, add it here — behind
 * a "could not fetch → say so, link out" guard, a very short cache and the
 * source's own timestamp — rather than relaxing this module.
 */

export const CLOSURE_SOURCE_MODE = "link-only" as const;

/** Why there is no live status — also returned by the API so a post-deploy check can assert it. */
export const CLOSURE_REASON_CODE = "no-stable-machine-readable-source" as const;

export const DGPA_CLOSURE_PAGE_URL = "https://www.dgpa.gov.tw/typh/daily/nds.html";
export const DGPA_CALENDAR_PAGE_URL = "https://www.dgpa.gov.tw/informationlist?uid=30";
export const OFFICE_CALENDAR_DATASET_PAGE_URL = "https://data.gov.tw/dataset/14718";

export interface ClosureLink {
  id: "announcement" | "contacts" | "history" | "regulation" | "qa" | "labor";
  url: string;
  /** Traditional Chinese label; the page translates the UI around it (links are government pages, in Chinese). */
  labelZh: string;
  /** The one link a visitor should open first. */
  primary: boolean;
}

export const CLOSURE_OFFICIAL_LINKS: readonly ClosureLink[] = [
  {
    id: "announcement",
    url: DGPA_CLOSURE_PAGE_URL,
    labelZh: "行政院人事行政總處：天然災害停止上班及上課情形（即時公告）",
    primary: true,
  },
  {
    id: "contacts",
    url: "https://www.dgpa.gov.tw/typh/daily/contact/Contact_Phone.html",
    labelZh: "各地方政府停班停課洽詢電話一覽表",
    primary: false,
  },
  {
    id: "history",
    url: "https://www.dgpa.gov.tw/informationlist?uid=374",
    labelZh: "歷次天然災害停止上班上課訊息",
    primary: false,
  },
  {
    id: "regulation",
    url: "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=S0110022",
    labelZh: "天然災害停止上班及上課作業辦法（全國法規資料庫）",
    primary: false,
  },
  {
    id: "qa",
    url: "https://www.dgpa.gov.tw/informations?uid=15",
    labelZh: "天然災害停止上班及上課作業 Q&A",
    primary: false,
  },
  {
    id: "labor",
    url: "https://laws.mol.gov.tw/FLAW/FLAWDAT01.aspx?id=FL049533",
    labelZh: "勞動部：天然災害發生事業單位勞工出勤管理及工資給付要點（民間事業單位）",
    primary: false,
  },
];

/** The attribution every surface that mentions closures must carry. */
export const CLOSURE_ATTRIBUTION_ZH = "依行政院人事行政總處公開資訊，非本站判定";

export interface ClosureGuidance {
  mode: typeof CLOSURE_SOURCE_MODE;
  /** Always false today: this site holds no per-county closure data. */
  liveStatusAvailable: false;
  reasonCode: typeof CLOSURE_REASON_CODE;
  officialUrl: string;
  links: readonly ClosureLink[];
  attributionZh: string;
  /**
   * Whether a CWA typhoon warning is in force (`null` = could not be read).
   * A prompt to go and read the official announcement — never a closure.
   */
  typhoonWarningActive: boolean | null;
}

export const buildClosureGuidance = (typhoonWarningActive: boolean | null): ClosureGuidance => ({
  mode: CLOSURE_SOURCE_MODE,
  liveStatusAvailable: false,
  reasonCode: CLOSURE_REASON_CODE,
  officialUrl: DGPA_CLOSURE_PAGE_URL,
  links: CLOSURE_OFFICIAL_LINKS,
  attributionZh: CLOSURE_ATTRIBUTION_ZH,
  typhoonWarningActive,
});
