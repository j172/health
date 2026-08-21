import "server-only";
import { createHash } from "node:crypto";

/**
 * Helpers every HTML news scraper needs.
 *
 * These two were defined identically in all six site scrapers
 * (fetchSetnHealthNews, fetchEttodayHealthNews, fetchHealthnewsNews,
 * fetchFiftyplusHealthNews, fetchUdnHealthNews, fetchBusinessweeklyHealthNews).
 * Six copies of a hash function is six places for the hash to quietly diverge,
 * and payload_hash divergence would re-insert every article as new.
 */

/** Stable content hash used for `external_id` and `payload_hash`. */
export const sha256 = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

/**
 * Resolves a possibly-relative href against the page it was scraped from.
 * Returns the input unchanged when it cannot be parsed, so a malformed href
 * degrades to a dead link rather than throwing mid-scrape.
 */
export const toAbsoluteUrl = (url: string, base: string): string => {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
};
