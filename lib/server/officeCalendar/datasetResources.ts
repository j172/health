/**
 * Picks the right yearly CSV out of the data.gov.tw metadata for dataset 14718
 * (《中華民國政府行政機關辦公日曆表》, issue #691).
 *
 * The CSV URLs are `dgpa.gov.tw/FileConversion?filename=dgpa/files/<yyyymm>/<uuid>.csv`
 * — a new random file name every time a year is published or corrected — so they
 * cannot be hard-coded; the data.gov.tw API
 * (`https://data.gov.tw/api/v2/rest/dataset/14718`) is the resolver.
 *
 * What the live metadata looks like (2026-10-16): ~25 `distribution` entries,
 * each `{ resourceDescription, resourceFormat, resourceCharacterEncoding,
 * resourceDownloadUrl }`. Per ROC year there is the main file
 * (`115年中華民國政府行政機關辦公日曆表`) and a `_Google行事曆專用` variant that
 * lists only the days off — the variant is never used here. A year can also
 * have a correction: the government amended the 2025 holidays in October 2025
 * and re-published 114 as `114年…辦公日曆表(1141020更新)` (Big5, not UTF-8),
 * added to the END of the list. Using the first match would have kept serving
 * the wrong 2025-09-29, 2025-10-24 and 2025-12-25.
 */

export interface CalendarResource {
  year: number;
  description: string;
  url: string;
  /** What the metadata claims (`UTF-8` / `BIG5`); decoding sniffs the bytes instead of trusting it. */
  encodingHint: string | null;
}

export const OFFICE_CALENDAR_DATASET_API = "https://data.gov.tw/api/v2/rest/dataset/14718";

/** The files are only ever fetched from the DGPA host the metadata points at. */
const ALLOWED_RESOURCE_HOSTS = new Set(["www.dgpa.gov.tw", "dgpa.gov.tw"]);

const MAIN_FILE_PATTERN = /^(\d{2,3})年中華民國政府行政機關辦公日曆表(?:\((\d{6,7})更新\))?(?:_utf8bom)?$/;

const rocToGregorian = (roc: number): number => roc + 1911;

export const gregorianToRoc = (year: number): number => year - 1911;

interface RawResource {
  resourceDescription?: unknown;
  resourceDownloadUrl?: unknown;
  resourceCharacterEncoding?: unknown;
}

const isAllowedUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_RESOURCE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
};

/**
 * The resource for each requested Gregorian year that the metadata lists
 * (missing years are simply absent from the map — the caller decides whether
 * that matters). A year's candidates are its main-file entries only; the
 * newest wins: the highest `(YYYMMDD更新)` stamp, and among equal stamps the
 * one listed last. Throws when the metadata is not the expected shape.
 */
export const resolveCalendarResources = (metadata: unknown, years: readonly number[]): Map<number, CalendarResource> => {
  const distribution = (metadata as { result?: { distribution?: unknown } } | null)?.result?.distribution;
  if (!Array.isArray(distribution)) {
    throw new Error("data.gov.tw 14718 metadata has no result.distribution list");
  }

  const wanted = new Set(years);
  const best = new Map<number, { resource: CalendarResource; stamp: number; index: number }>();

  distribution.forEach((raw: RawResource, index) => {
    const description = typeof raw?.resourceDescription === "string" ? raw.resourceDescription.trim() : "";
    const url = typeof raw?.resourceDownloadUrl === "string" ? raw.resourceDownloadUrl.trim() : "";
    const match = MAIN_FILE_PATTERN.exec(description);
    if (!match || !url || !isAllowedUrl(url)) return;

    const year = rocToGregorian(Number(match[1]));
    if (!wanted.has(year)) return;

    const stamp = match[2] ? Number(match[2]) : 0;
    const encodingHint = typeof raw.resourceCharacterEncoding === "string" ? raw.resourceCharacterEncoding : null;
    const current = best.get(year);
    if (!current || stamp > current.stamp || (stamp === current.stamp && index > current.index)) {
      best.set(year, { resource: { year, description, url, encodingHint }, stamp, index });
    }
  });

  return new Map([...best].map(([year, entry]) => [year, entry.resource]));
};
