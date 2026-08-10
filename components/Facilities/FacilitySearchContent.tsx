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
  extra_json: { weeklyHours?: Record<string, string[]> } | null;
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Keyword search never sends lat/lng (see below), so distance can't be computed —
  // drop back to name sort rather than let the dropdown keep a now-meaningless selection.
  useEffect(() => {
    if (keyword && sort === "distance") setSort("name");
  }, [keyword, sort]);

  useEffect(() => {
    if (location.loading) return;
    let cancelled = false;
    setLoading(true);
    setError(false);

    const params = new URLSearchParams({ type: facilityType });
    if (keyword) {
      // Keyword search browses by name/address regardless of geocoding status.
      params.set("keyword", keyword);
    } else {
      // No keyword — fall back to GPS-nearby (only surfaces already-geocoded rows).
      params.set("lat", String(location.lat));
      params.set("lng", String(location.lng));
      params.set("radius", String(radiusMeters));
    }
    if (category) params.set("category", category);
    if (sort) params.set("sort", sort);

    fetch(`/api/facilities?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setFacilities(data.facilities);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [location.loading, location.lat, location.lng, keyword, facilityType, radiusMeters, category, sort]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setKeyword(searchInput.trim());
  };

  const geocoded = (facilities ?? []).filter((f): f is FacilityItem & { lat: number; lng: number } => f.lat !== null && f.lng !== null);
  const markers: MapMarker[] = geocoded.map((f) => ({ id: String(f.id), lat: f.lat, lng: f.lng, name: f.name, address: f.address, phone: f.phone }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 md:text-4xl">
          {emoji} {title}
        </h1>
        <p className="text-neutral-600">{description}</p>
        {noteLine && <p className="mt-1 text-xs text-neutral-500">{noteLine}</p>}
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={searchPlaceholder}
          className="min-w-[160px] flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none"
        />
        {categories && categories.length > 0 && (
          <>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="分類篩選"
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none"
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
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none"
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
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            清除
          </button>
        )}
      </form>

      {locationDefaultWarning && !keyword && location.isDefault && !location.loading && <p className="text-xs text-neutral-500">{locationDefaultWarning}</p>}

      {(loading || location.loading) && (
        <div className="flex justify-center py-8">
          <LoadingOrb size={32} />
        </div>
      )}

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{errorText}</div>}

      {!loading && !location.loading && !error && facilities && (
        <>
          {markers.length > 0 && (
            <div className="h-[400px] overflow-hidden rounded-xl border border-neutral-200">
              <FacilityMap userLocation={location} markers={markers} radiusMeters={radiusMeters} showRadius={!keyword} />
            </div>
          )}

          {facilities.length === 0 ? (
            <p className="py-8 text-center text-neutral-500">{keyword ? emptyStateWithKeyword : emptyStateNoKeyword}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500">共 {facilities.length} 筆</p>
              {facilities.map((f) => (
                <div key={f.id} className="rounded-xl border border-neutral-200 p-4">
                  {serviceItem === "badge" ? (
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-neutral-800">{f.name}</p>
                      {f.service_item && <span className="shrink-0 rounded-full bg-zumthor px-2 py-0.5 text-xs text-primary">{f.service_item}</span>}
                    </div>
                  ) : (
                    <p className="font-semibold text-neutral-800">{f.name}</p>
                  )}
                  {f.address && <p className="mt-1 text-sm text-neutral-600">{f.address}</p>}
                  {f.phone && <p className="mt-1 text-xs text-neutral-500">📞 {f.phone}</p>}
                  {typeof serviceItem === "object" && f.service_item && (
                    <p className="mt-1 text-xs text-neutral-500">
                      {serviceItem.label}
                      {f.service_item}
                    </p>
                  )}
                  {showWeeklyHours && <WeeklyHoursLine weeklyHours={f.extra_json?.weeklyHours} />}
                  {showGeocodeNote && f.lat === null && <p className="mt-1 text-xs text-neutral-400">（尚未完成地理定位，暫不顯示於地圖）</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
