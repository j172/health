// WHO Disease Outbreak News (DON) shared types — issue #596, parent #583.
// See lib/server/who/sources/who.ts for the fetch+parse module and
// lib/server/db/schema.ts (whoOutbreakNews) for the table these feed.

/**
 * One parsed WHO DON row, ready for upsertWhoOutbreakNews(). Mirrors
 * who_outbreak_news' columns directly (see schema.ts).
 */
export interface IncomingWhoOutbreakNews {
  /** WHO's own `DonId` (e.g. "2026-DON620") — stable, human-readable, and
   * what the real DON page's URL is built from. This is the "WHO 文章 ID"
   * the issue asks for and what who_outbreak_news' UNIQUE KEY matches on. */
  articleId: string;
  /** The full original-language (English) DON title, exactly as published —
   * e.g. "Ebola disease caused by Bundibugyo virus - Democratic Republic of
   * the Congo". This is the "標題原文" column; disease/country below are
   * *derived* from it, not a separate upstream field (WHO's API doesn't
   * expose disease/country as their own scalar fields — see
   * lib/server/who/sources/who.ts's parseWhoDonTitle). */
  title: string;
  /** MySQL DATETIME string (UTC), from WHO's `PublicationDateAndTime`. */
  publishDate: string;
  /** Disease name exactly as it appears in the title's disease segment
   * (original language, English) — the "原文" half of "疾病（原文與字典對應
   * 結果）". */
  diseaseRaw: string;
  /** Dictionary-mapped disease name (see lib/server/who/diseaseNames.ts),
   * or null when diseaseRaw isn't in that hand-checked dictionary — never a
   * guessed/machine-translated value (same "查不到時顯示原文，不猜測翻譯"
   * contract issue #589 already established for the epidemics item's own
   * disease dictionary). */
  diseaseMapped: string | null;
  /** ISO 3166-1 alpha-2 country code, resolved via
   * lib/server/who/countryIso.ts (which reuses issue #589's epidemics ISO
   * lookup table, per this issue's own instruction). Null when the title's
   * location segment doesn't resolve to exactly one country — e.g.
   * "Global", "Multi-country", "African Region (AFRO)", or a
   * multi-country title like "Democratic Republic of the Congo & Uganda". */
  countryIso: string | null;
  /** The real DON article's public URL, built from articleId:
   * https://www.who.int/emergencies/disease-outbreak-news/item/{articleId}
   * (confirmed live, see PR description). */
  url: string;
}

export const toMysqlDatetimeUtc = (date: Date): string =>
  date.toISOString().slice(0, 19).replace("T", " ");
