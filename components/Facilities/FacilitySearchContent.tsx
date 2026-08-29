"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useGeolocation } from "@/components/Facilities/useGeolocation";
import type { MapMarker } from "@/components/Facilities/FacilityMap";
import WeeklyHoursLine from "@/components/Facilities/WeeklyHours";
import LoadingOrb from "@/components/ui/LoadingOrb";

const FacilityMap = dynamic(() => import("@/components/Facilities/FacilityMap"), { ssr: false });

export type ServiceItemDisplay = "none" | "badge" | { label: string };

export interface FacilitySearchConfig {
  facilityType: string;
  emoji: string;
  title: string;
  description: string;
  /** Extra static line shown under the description, e.g. a data-source caveat. */
  noteLine?: string;
  searchPlaceholder: string;
  radiusMeters?: number;
  errorText: string;
  emptyStateNoKeyword: string;
  emptyStateWithKeyword: string;
  serviceItem?: ServiceItemDisplay;
  showWeeklyHours?: boolean;
  showGeocodeNote?: boolean;
  /** Shown when the user hasn't searched by keyword and geolocation fell back to the default position. */
  locationDefaultWarning?: string;
  /** When set, shows a category filter + sort dropdown next to the search bar, matching against the facilities.service_item column. */
  categories?: { value: string; label: string }[];
}

interface FacilityItem {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  service_item: string | null;
  extra_json: {
    weeklyHours?: Record<string, string[]>;
    weeklyHoursNote?: string;
    charityUrl?: string;
    charityName?: string;
  } | null;
  /**
   * Only present on GPS searches — the Haversine distance the API sorted the list by.
   * Genuinely a number over the wire (MySQL DOUBLE), unlike the DECIMAL lat/lng columns,
   * which arrive as strings; see the field's note in lib/server/facilities/queries.ts.
   */
  distance_km?: number;
}

/**
 * Radius used to re-run a nearby search that came back empty. 500km covers Taiwan
 * end to end, so the widened query is effectively "the whole dataset, still ordered
 * by how far away it is from you".
 */
const NEARBY_FALLBACK_RADIUS_METERS = 500000;

/**
 * Pulls the tool's own noun out of copy it already carries, so the nearby-fallback
 * notice can name what it is listing ("附近查無收錄的伯公照護站，可改用關鍵字搜尋。"
 * → "伯公照護站"). Every config phrases `emptyStateNoKeyword` the same way, and the
 * ones that don't still end their `title` in 查詢 — reusing those beats adding an
 * 18th place where each tool's noun has to be spelled out and kept in sync.
 */
const facilityNoun = (emptyStateNoKeyword: string, title: string): string => {
  const fromEmptyState = emptyStateNoKeyword.match(/查無(?:已定位的|收錄的)?(.+?)[，,。]/);
  if (fromEmptyState) return fromEmptyState[1];
  return title.replace(/查詢$/, "") || "資料";
};

/**
 * Shared search/map/list UI for the government facility lookups under /tools.
 * Every source (pharmacies, clinics, long-term care, welfare registries, etc.) fetches from
 * the same `/api/facilities` endpoint and renders the same skeleton — only the copy, radius,
 * and how (if at all) `service_item`/weekly hours/geocode status are displayed differ.
 */
export default function FacilitySearchContent({ config }: { config: FacilitySearchConfig }) {
  const {
    facilityType,
    emoji,
    title,
    description,
    noteLine,
    searchPlaceholder,
    radiusMeters = 10000,
    errorText,
    emptyStateNoKeyword,
    emptyStateWithKeyword,
    serviceItem = "none",
    showWeeklyHours = false,
    showGeocodeNote = false,
    locationDefaultWarning,
    categories,
  } = config;

  const location = useGeolocation();
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<"distance" | "name" | "category">("distance");
  const [facilities, setFacilities] = useState<FacilityItem[] | null>(null);
  /** Size of the whole dataset for this facility type, independent of the current filters. */
  const [total, setTotal] = useState<number | null>(null);
  /** True when the rendered list came from the widened fallback radius rather than the configured one. */
  const [widenedRadius, setWidenedRadius] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Keyword search never sends lat/lng (see below), so distance can't be computed —
  // drop back to name sort rather than let the dropdown keep a now-meaningless selection.
  const effectiveSort = keyword && sort === "distance" ? "name" : sort;

  useEffect(() => {
    if (location.loading) return;
    let cancelled = false;

    const load = async (radius: number): Promise<{ facilities: FacilityItem[]; total?: number }> => {
      const params = new URLSearchParams({ type: facilityType });
      if (keyword) {
        // Keyword search browses by name/address regardless of geocoding status.
        params.set("keyword", keyword);
      } else {
        // No keyword — fall back to GPS-nearby (only surfaces already-geocoded rows).
        params.set("lat", String(location.lat));
        params.set("lng", String(location.lng));
        params.set("radius", String(radius));
      }
      if (category) params.set("category", category);
      if (effectiveSort) params.set("sort", effectiveSort);

      const res = await fetch(`/api/facilities?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };

    (async () => {
      try {
        let data = await load(radiusMeters);
        let widened = false;

        // A dataset can be nationally large and locally empty at the same time — 伯公照護站
        // holds ~611 rows but almost none within 10km of Taipei. An empty page there reads as
        // "this tool has no data", so re-run the same query at a 500km radius and show the
        // nearest rows instead.
        //
        // The re-run keeps lat/lng deliberately: that is what makes the server keep
        // ORDER BY distance_km, so the widened list is genuinely "the closest ones, however
        // far that is". Dropping the coordinates instead would silently switch the server to
        // ORDER BY name and hand a Taipei reader 200 alphabetically-first rows from Miaoli.
        if (!keyword && data.facilities.length === 0) {
          const widenedData = await load(NEARBY_FALLBACK_RADIUS_METERS);
          if (widenedData.facilities.length > 0) {
            data = widenedData;
            widened = true;
          }
        }

        if (!cancelled) {
          setFacilities(data.facilities);
          setTotal(typeof data.total === "number" ? data.total : null);
          setWidenedRadius(widened);
          setError(false);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.loading, location.lat, location.lng, keyword, facilityType, radiusMeters, category, effectiveSort]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    setKeyword(trimmed);
    if (trimmed && sort === "distance") {
      setSort("name");
    }
  };

  const geocoded = (facilities ?? []).filter((f): f is FacilityItem & { lat: number; lng: number } => f.lat !== null && f.lng !== null);
  const markers: MapMarker[] = geocoded.map((f) => ({
    id: String(f.id),
    lat: f.lat,
    lng: f.lng,
    name: f.name,
    address: f.address,
    phone: f.phone,
    charityUrl: f.extra_json?.charityUrl,
    charityName: f.extra_json?.charityName,
  }));

  // Naming both numbers — the radius that found nothing and how far the closest row actually
  // is — is what turns "we found nothing near you" into useful information.
  //
  // Scan the whole list for the minimum rather than reading row 0. Row 0 is only the nearest
  // hit while the server ordered by distance, and the sort dropdown can select 名稱 or 類別
  // with no keyword active — `effectiveSort` only rewrites `distance` away when a keyword is
  // set — which leaves the rows GPS-filtered and carrying a distance_km, but ordered by name.
  // Row 0 would then hold a real distance that simply isn't the smallest one, and this notice
  // must not print a confidently wrong number. The list is capped at 200, so the scan is free.
  const noun = facilityNoun(emptyStateNoKeyword, title);
  const nearestKm = (facilities ?? []).reduce((min, f) => {
    const km = Number(f.distance_km);
    return Number.isFinite(km) && km < min ? km : min;
  }, Infinity);
  // Infinity when no row carried a distance (a non-GPS list) — drop the clause rather than guess.
  const nearestText = Number.isFinite(nearestKm) ? `（最近一處約 ${Math.round(nearestKm)} 公里）` : "";
  const fallbackNotice = widenedRadius ? `您附近 ${radiusMeters / 1000} 公里內沒有${noun}，以下依距離列出最近的${noun}${nearestText}。` : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">
          {emoji} {title}
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">{description}</p>
        {noteLine && <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">{noteLine}</p>}
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={searchPlaceholder}
          className="min-w-[160px] flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        {categories && categories.length > 0 && (
          <>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="分類篩解"
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">全部分類</option>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              aria-label="排序方式"
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {!keyword && <option value="distance">距離最近</option>}
              <option value="name">名稱 A-Z</option>
              <option value="category">依分類</option>
            </select>
          </>
        )}
        <button type="submit" className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primaryho">
          搜尋
        </button>
        {keyword && (
          <button
            type="button"
            onClick={() => {
              setKeyword("");
              setSearchInput("");
            }}
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            清除
          </button>
        )}
      </form>

      {locationDefaultWarning && !keyword && location.isDefault && !location.loading && <p className="text-xs text-neutral-500 dark:text-slate-400">{locationDefaultWarning}</p>}

      {(loading || location.loading) && (
        <div className="flex justify-center py-8">
          <LoadingOrb size={32} />
        </div>
      )}

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{errorText}</div>}

      {!loading && !location.loading && !error && facilities && (
        <>
          {markers.length > 0 && (
            <div className="h-[400px] overflow-hidden rounded-xl border border-neutral-200 dark:border-slate-800">
              {/* Don't draw the configured radius circle once the fallback widened past it — the
                  circle would sit empty while every marker on the map lies outside it. */}
              <FacilityMap userLocation={location} markers={markers} radiusMeters={radiusMeters} showRadius={!keyword && !widenedRadius} />
            </div>
          )}

          {fallbackNotice && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{fallbackNotice}</p>
          )}

          {facilities.length === 0 ? (
            // Reached only when the widened fallback also came back empty, so this now means
            // "nothing anywhere in the dataset" rather than "nothing within the radius".
            <p className="py-8 text-center text-neutral-500 dark:text-slate-400">{keyword ? emptyStateWithKeyword : emptyStateNoKeyword}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500 dark:text-slate-400">
                顯示 {facilities.length} 筆{total !== null && `／全台共 ${total} 筆`}
              </p>
              {facilities.map((f) => (
                <div key={f.id} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-neutral-800 dark:text-slate-100">{f.name}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      {serviceItem === "badge" && f.service_item && (
                        <span className="rounded-full bg-zumthor px-2 py-0.5 text-xs text-primary dark:bg-primary/20">{f.service_item}</span>
                      )}
                      {f.extra_json?.charityUrl && (
                        <a
                          href={f.extra_json.charityUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 border border-rose-200 shadow-sm transition-all hover:bg-rose-100 hover:border-rose-300 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/60"
                        >
                          <span>🛍️</span>
                          <span>{f.extra_json.charityName || "愛心義賣"}</span>
                          <span className="text-[10px]">↗</span>
                        </a>
                      )}
                    </div>
                  </div>
                  {f.address && <p className="mt-1 text-sm text-neutral-600 dark:text-slate-300">{f.address}</p>}
                  {f.phone && <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">📞 {f.phone}</p>}
                  {typeof serviceItem === "object" && f.service_item && (
                    <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                      {serviceItem.label}
                      {f.service_item}
                    </p>
                  )}
                  {showWeeklyHours && <WeeklyHoursLine weeklyHours={f.extra_json?.weeklyHours} note={f.extra_json?.weeklyHoursNote} />}
                  {showGeocodeNote && f.lat === null && <p className="mt-1 text-xs text-neutral-400 dark:text-slate-500">（尚未完成地理定位，暫不顯示於地圖）</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
