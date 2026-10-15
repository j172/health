import { isGarbageRouteCity, type GarbageRouteCity } from "@/lib/tools/garbageTrucks/coverage";

/** Page-size default matches the site-wide pagination default (usePagination's DEFAULT_PAGE_SIZE). */
export const DEFAULT_LIMIT = 30;
export const MAX_LIMIT = 100;
export const MAX_KEYWORD_LENGTH = 60;
const MAX_DISTRICT_LENGTH = 20;
const MAX_OFFSET = 1_000_000;

export interface GarbageRouteSearchParams {
  city: GarbageRouteCity;
  district: string | undefined;
  keyword: string | undefined;
  limit: number;
  offset: number;
}

export type ParsedGarbageRouteSearch =
  | { ok: true; params: GarbageRouteSearchParams }
  | { ok: false; error: string };

const toInt = (raw: string | null): number | null => {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.trunc(value) : null;
};

const trimmedOrUndefined = (raw: string | null, maxLength: number): string | undefined => {
  const value = (raw ?? "").trim().slice(0, maxLength);
  return value === "" ? undefined : value;
};

/** Validates and normalises the query string of GET /api/garbage-routes. */
export function parseGarbageRouteSearchParams(searchParams: URLSearchParams): ParsedGarbageRouteSearch {
  const city = searchParams.get("city");
  if (!isGarbageRouteCity(city)) {
    return { ok: false, error: "Missing or unsupported 'city' (expected taipei or new_taipei)" };
  }

  const limitRaw = toInt(searchParams.get("limit"));
  const limit = limitRaw === null ? DEFAULT_LIMIT : Math.min(MAX_LIMIT, Math.max(1, limitRaw));

  const offsetRaw = toInt(searchParams.get("offset"));
  const offset = offsetRaw === null ? 0 : Math.min(MAX_OFFSET, Math.max(0, offsetRaw));

  return {
    ok: true,
    params: {
      city,
      district: trimmedOrUndefined(searchParams.get("district"), MAX_DISTRICT_LENGTH),
      keyword: trimmedOrUndefined(searchParams.get("keyword"), MAX_KEYWORD_LENGTH),
      limit,
      offset,
    },
  };
}

/** Escapes LIKE wildcards for use with `LIKE ? ESCAPE '!'`. */
export function escapeLike(value: string): string {
  return value.replace(/[!%_]/g, (char) => `!${char}`);
}
