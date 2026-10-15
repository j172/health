import { facilitySearchConfigs } from "@/app/(zh)/tools/facilityConfigs";
import { memoizeQuery } from "@/lib/server/cache/memo";
import type { CulturalActivityItem } from "@/lib/server/culture/types";
import type { Locale } from "@/lib/i18n/dictionary";
import {
  buildCulturalEventsJsonLd,
  buildFacilityListJsonLd,
  type FacilityJsonLdSource,
} from "./structuredData";

/**
 * Loads the data behind the extra, tool-specific JSON-LD node issue #438 §R
 * asks for on two kinds of /tools/<slug> page, and hands it to the pure
 * builders in ./structuredData. ToolPageShell calls this once per render
 * (zh and /en /ja /ko alike), so neither page type needs its own wiring.
 *
 * - cultural-events → schema.org `Event` nodes (soonest upcoming events)
 * - clinics / pharmacies / aed / public-toilets / cool-spots → an `ItemList`
 *   of facilities with `geo`/`address`/`telephone`
 *
 * Everything here is location-independent by construction: the facility
 * samples are fixed queries, not "nearest to the visitor" lookups, and no
 * coordinates from the request ever reach the output. A failing query (e.g.
 * `next build` on the CI runner, which has no database) just means no extra
 * node — the page itself must never break over structured data.
 */

/** Rows fetched per query; the builders cap what is actually emitted. */
const EVENT_FETCH_LIMIT = 40;
const FACILITY_FETCH_LIMIT = 30;
const MEMO_TTL_SECONDS = 600;

/**
 * Which facility-list tools get an ItemList, and which fixed sample each one
 * uses. `facilityType` is read from facilitySearchConfigs (the single source
 * the tool pages themselves query with) so it cannot drift. The clinics page
 * samples 醫學中心 specifically: a small, stable, nationally meaningful set
 * (all `Hospital`) instead of an arbitrary alphabetical slice of ~25k rows.
 */
const FACILITY_LIST_SAMPLES: Record<string, { facilityType: string; serviceItem?: string }> = {
  clinics: { facilityType: facilitySearchConfigs.clinics.facilityType, serviceItem: "醫學中心" },
  pharmacies: { facilityType: facilitySearchConfigs.pharmacies.facilityType },
  aed: { facilityType: facilitySearchConfigs.aed.facilityType },
  "public-toilets": { facilityType: facilitySearchConfigs["public-toilets"].facilityType },
  "cool-spots": { facilityType: facilitySearchConfigs["cool-spots"].facilityType },
};

/** Slugs whose tool page emits a facility ItemList (exported for tests). */
export const FACILITY_LIST_JSONLD_SLUGS: string[] = Object.keys(FACILITY_LIST_SAMPLES);

export interface ToolPageJsonLdDeps {
  searchEvents: (limit: number) => Promise<CulturalActivityItem[]>;
  searchFacilities: (query: { facilityType: string; serviceItem?: string; limit: number }) => Promise<FacilityJsonLdSource[]>;
  now: () => Date;
}

// The DB-backed modules are loaded lazily so importing this file (and the
// pure builders it feeds) never drags mysql into a test or an unrelated bundle.
const defaultDeps: ToolPageJsonLdDeps = {
  searchEvents: async (limit) => {
    const { searchCulturalEvents } = await import("@/lib/server/culture/queries");
    return (await searchCulturalEvents({ limit })).items;
  },
  searchFacilities: async ({ facilityType, serviceItem, limit }) => {
    const { searchFacilities } = await import("@/lib/server/facilities/queries");
    return searchFacilities({ facilityType, serviceItem, limit, sort: "category" });
  },
  now: () => new Date(),
};

/** Structured data must never hold the page up: past this, the page renders without the extra node. */
export const SUPPLEMENT_TIMEOUT_MS = 4000;

const withTimeout = <T>(work: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

export const loadToolPageSupplementJsonLd = async ({
  slug,
  title,
  description,
  locale = "zh-TW",
  deps: overrides,
  timeoutMs = SUPPLEMENT_TIMEOUT_MS,
}: {
  slug: string;
  /** The (already localized) tool title — becomes a facility list's name. */
  title: string;
  description?: string;
  locale?: Locale;
  deps?: Partial<ToolPageJsonLdDeps>;
  timeoutMs?: number;
}): Promise<Record<string, unknown> | null> => {
  const deps: ToolPageJsonLdDeps = { ...defaultDeps, ...overrides };

  try {
    if (slug === "cultural-events") {
      // A throwing fetcher is never cached by memoizeQuery, so a transient
      // outage does not pin an empty result for the whole TTL.
      const items = await withTimeout(
        memoizeQuery(
          `jsonld_cultural_events_${EVENT_FETCH_LIMIT}`,
          () => deps.searchEvents(EVENT_FETCH_LIMIT),
          MEMO_TTL_SECONDS,
        ),
        timeoutMs,
      );
      return buildCulturalEventsJsonLd(items, { locale, now: deps.now() });
    }

    const sample = FACILITY_LIST_SAMPLES[slug];
    if (sample) {
      const facilities = await withTimeout(
        memoizeQuery(
          `jsonld_facilities_${slug}_${FACILITY_FETCH_LIMIT}`,
          () => deps.searchFacilities({ ...sample, limit: FACILITY_FETCH_LIMIT }),
          MEMO_TTL_SECONDS,
        ),
        timeoutMs,
      );
      return buildFacilityListJsonLd(
        { facilityType: sample.facilityType, name: title, description, facilities },
        { locale, canonicalPath: `/tools/${slug}` },
      );
    }
  } catch (error) {
    console.warn(
      `[jsonld] Skipping supplementary structured data for /tools/${slug}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return null;
};
