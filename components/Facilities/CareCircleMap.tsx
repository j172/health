"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useLocationWithManualFallback } from "@/lib/hooks/useLocationWithManualFallback";
import type { MapMarker } from "@/components/Facilities/FacilityMap";
import MapLocationBanner from "@/components/Common/MapLocationBanner";
import MapPendingPlaceholder from "@/components/Common/MapPendingPlaceholder";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";

const FacilityMap = dynamic(() => import("@/components/Facilities/FacilityMap"), { ssr: false });

/** The three selectable straight-line radii (issue #484 acceptance criteria). */
export const CARE_CIRCLE_RADII_KM = [1, 3, 5] as const;
export type CareCircleRadiusKm = (typeof CARE_CIRCLE_RADII_KM)[number];

/**
 * Fixed disclaimer text required by issue #484: the radius is a straight-line
 * (geometric) circle, not a routed drive time — "不使用任何路徑規劃服務" means this
 * never calls Google Maps Directions or any other routing API, same as the
 * existing `<Circle>` FacilityMap already draws for the per-tool default radius.
 */
export const CARE_CIRCLE_DISCLAIMER =
  "直線距離，市區約等於車程 10 分鐘，實際依路況而定。";

/**
 * API's own per-request row cap (see app/api/facilities/route.ts's `limit` clamp).
 * Large enough that undercounting resources inside a <=5km urban radius is very
 * unlikely — the known facility types here (long-term care, home healthcare, elder
 * welfare, hakka bogong stations) aren't dense enough per locality to realistically
 * exceed it within 5km.
 */
const CARE_CIRCLE_FETCH_LIMIT = 500;

interface RawFacility {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * issue #484 (2.0 §D merge item M4) — "照顧圈" (care-circle) feature for the merged
 * long-term-care page.
 *
 * Deliberately NOT built into `FacilitySearchContent` (shared by 30 other /tools
 * pages, per the issue's blast-radius concern): this is a standalone component that
 * does its own `/api/facilities` fetch with a client-controlled straight-line radius,
 * and renders its own `FacilityMap` instance (separate from the one
 * `FacilitySearchContent` already renders below it) — so switching the radius here
 * never touches FacilitySearchContent's props, state, or default behavior for any of
 * its other 29 consumers.
 *
 * Counting note: `/api/facilities`'s `total`/`allTotal` fields never reflect the
 * `radius` query param on the DB-backed path — `countFilteredFacilities()` (see
 * lib/server/facilities/queries.ts) only counts keyword/county/district/category/
 * charity filters, not distance. The only radius-accurate signal is the length of the
 * returned `facilities` array itself (the DB query's `HAVING distance_km <= radius`
 * clause is applied to the actual rows, up to `limit`), so this component counts that
 * directly instead of trusting either total field.
 *
 * UX note: this intentionally does NOT reuse FacilitySearchContent's existing
 * `widenedRadius`/`fallbackNotice` mechanism, which silently re-runs the search at a
 * much larger radius (500km) and shows the wider results without asking. Issue #484
 * asks for an explicit prompt instead — the user chooses whether to widen, the circle
 * just stays empty until they do.
 */
export default function CareCircleMap({
  facilityType,
  resourceNoun,
}: {
  /** The `facilities.facility_type` value for the currently selected type tab (e.g. "long_term_care"). */
  facilityType: string;
  /** Short noun for the count/prompt copy, e.g. "長照機構", "伯公照護站". */
  resourceNoun: string;
}) {
  const {
    geolocation,
    manualCounty,
    manualDistrict,
    setManualCounty,
    setManualDistrict,
    effectiveCoords,
    hasManualCoords,
  } = useLocationWithManualFallback();
  const [radiusKm, setRadiusKm] = useState<CareCircleRadiusKm>(3);
  const [count, setCount] = useState<number | null>(null);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!effectiveCoords) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          type: facilityType,
          lat: String(effectiveCoords.lat),
          lng: String(effectiveCoords.lng),
          radius: String(radiusKm * 1000),
          sort: "distance",
          limit: String(CARE_CIRCLE_FETCH_LIMIT),
        });

        const res = await fetchWithTimeout(`/api/facilities?${params.toString()}`, { timeoutMs: 5000 });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { facilities?: RawFacility[] } = await res.json();
        const facilities = Array.isArray(data.facilities) ? data.facilities : [];

        if (!cancelled) {
          setCount(facilities.length);
          setMarkers(
            facilities
              .filter((f): f is RawFacility & { lat: number; lng: number } => f.lat !== null && f.lng !== null)
              .map((f) => ({ id: String(f.id), lat: f.lat, lng: f.lng, name: f.name, address: f.address, phone: f.phone })),
          );
          setError(false);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setCount(null);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [facilityType, radiusKm, effectiveCoords]);

  const nextWiderRadiusKm = CARE_CIRCLE_RADII_KM.find((r) => r > radiusKm);
  const showWidenPrompt = !loading && !error && count === 0 && nextWiderRadiusKm !== undefined;
  const showNoResultAtMaxRadius = !loading && !error && count === 0 && nextWiderRadiusKm === undefined;

  return (
    <div className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-indigo-900 dark:text-indigo-200">⭕ 照顧圈半徑</span>
          <div role="tablist" aria-label="照顧圈半徑選擇" className="flex gap-1.5">
            {CARE_CIRCLE_RADII_KM.map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={radiusKm === r}
                onClick={() => setRadiusKm(r)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  radiusKm === r
                    ? "bg-indigo-600 text-white shadow-xs dark:bg-indigo-500"
                    : "border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300"
                }`}
              >
                {r} 公里
              </button>
            ))}
          </div>
        </div>

        <div className="text-sm font-semibold text-indigo-900 dark:text-indigo-200" aria-live="polite">
          {!effectiveCoords ? "等待定位…" : loading ? "計算中…" : error ? "計算失敗" : `圈內有 ${count ?? 0} 個${resourceNoun}`}
        </div>
      </div>

      {/* 固定附註：直線距離，非實際車程（issue #484 要求貼近半徑控制元件，不可被埋藏） */}
      <p className="text-xs text-indigo-700 dark:text-indigo-300">ⓘ {CARE_CIRCLE_DISCLAIMER}</p>

      <MapLocationBanner
        geolocation={geolocation}
        manualCounty={manualCounty}
        manualDistrict={manualDistrict}
        onCountyChange={setManualCounty}
        onDistrictChange={setManualDistrict}
        hasManualCoords={hasManualCoords}
        facilityTypeName={resourceNoun}
      />

      {showWidenPrompt && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {radiusKm} 公里內查無{resourceNoun}，可嘗試切換至 {nextWiderRadiusKm} 公里。
        </p>
      )}
      {showNoResultAtMaxRadius && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {radiusKm} 公里內查無{resourceNoun}，建議改用下方關鍵字或地區搜尋。
        </p>
      )}

      {!effectiveCoords ? (
        <div className="h-[320px] overflow-hidden rounded-xl border border-indigo-100 dark:border-indigo-900/60">
          <MapPendingPlaceholder geolocation={geolocation} />
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          照顧圈計算失敗，請稍後再試。
        </div>
      ) : (
        <div className="h-[320px] overflow-hidden rounded-xl border border-indigo-100 dark:border-indigo-900/60">
          <FacilityMap
            userLocation={{ lat: effectiveCoords.lat, lng: effectiveCoords.lng, isDefault: false, refresh: geolocation.refresh }}
            markers={markers}
            radiusMeters={radiusKm * 1000}
            showRadius
          />
        </div>
      )}
    </div>
  );
}
