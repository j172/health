"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useSharedGeolocation } from "@/lib/hooks/useSharedGeolocation";
import { type GeolocationOverride, isValidGeolocationOverride } from "@/lib/utils/geolocationOverride";
import type { MapMarker } from "@/components/Facilities/FacilityMap";
import WeeklyHoursLine from "@/components/Facilities/WeeklyHours";
import LoadingOrb from "@/components/ui/LoadingOrb";
import Pagination from "@/components/Tools/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";
import { FacilityPenaltyBadge, FacilityPenaltyAccordion } from "@/components/Facilities/FacilityPenaltySection";
import type { FacilityPenaltyInfo } from "@/lib/server/facilities/sources/nhiPenalties";

import MapLocationBanner from "@/components/Common/MapLocationBanner";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import CountyDistrictPicker from "@/components/Facilities/CountyDistrictPicker";
import { TAIWAN_COUNTY_CENTROIDS } from "@/lib/constants/taiwanDistricts";
import { useLanguage } from "@/app/context/LanguageContext";
import { buildGoogleMapsDirUrl, getNavigationButtonLabel } from "@/lib/utils/mapNavigation";
import CopyAddressButton from "@/components/Tools/CopyAddressButton";

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
  /** When set, shows a checkbox next to the search bar that filters to rows with extra_json.charityUrl set. */
  charityFilter?: { label: string };
  /**
   * Free-form extra_json fields shown as additional lines on each card,
   * beyond the handful of hardcoded ones below (charityUrl/abcLevel/
   * emptySeats/evaluations/serviceDistrict+serviceObject/penalty). Added for
   * #566 (成癮防治分頁 — 戒治機構模式／戒治服務內容 have no generic facilities
   * column of their own) and kept generic — any `extra_json` key can be
   * surfaced this way — so a later facility type (e.g. #571's methadone
   * cross-district dosing or county drug-prevention centers) can reuse it
   * without another change to this component.
   */
  extraFields?: { key: string; label: string }[];
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
    penalty?: FacilityPenaltyInfo;
    openBeds?: number | string | null;
    currentResidents?: number | string | null;
    emptySeats?: number | string | null;
    abcLevel?: string | null;
    evaluations?: Array<{
      year: string;
      result: string;
      validUntil: string;
      start?: string;
      end?: string;
    }>;
    respiteCodes?: string[];
    serviceDistrict?: string | null;
    serviceObject?: string | null;
    /** addiction_treatment facility type (#566) — surfaced via `extraFields`, not hardcoded like the fields above. */
    addictionTreatmentMode?: string | null;
    addictionTreatmentService?: string | null;
    [key: string]: unknown;
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
 * Issue #157: the page-size switcher (30/50/100) needs enough fetched rows to page
 * through — the API's own default cap (200) only just clears one 100-per-page page.
 * 300 comfortably covers 3 pages at the largest size without turning every facility
 * search into an unbounded query.
 */
const FETCH_LIMIT = 300;

/**
 * 法務部戒毒成功專線（#566 的成癮防治分頁要求固定顯示）。截至這張票完成時 #563
 * （緊急電話資料修正：毒品防制諮詢專線號碼從誤植的 0800-024-555 改成這支）尚未
 * 合併，data/government-hotlines.json 裡還是舊號碼，所以這裡先寫死；#563 合併
 * 後應改成直接引用那份緊急電話資料，而不是維護第二個號碼來源。
 */
const ADDICTION_HOTLINE = "0800-770-885";

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
export default function FacilitySearchContent({
  config,
  locationOverride = null,
  slug,
}: {
  config: FacilitySearchConfig;
  /**
   * Optional `?lat=&lng=` override (issue #463) resolved server-side by the calling
   * page from its own `searchParams` — see the comment above `useSharedGeolocation(...)`
   * below for why this is a prop here instead of this component calling
   * `useSearchParams()` itself. `null`/omitted preserves the pre-existing
   * browser-geolocation-first behavior exactly.
   */
  locationOverride?: GeolocationOverride | null;
  /**
   * Issue #486: when set, the handful of per-tool strings this config
   * carries (title/description/etc.) are looked up under the
   * `${slug}Tool.*` dictionary namespace, with the config's own Chinese
   * value as the fallback — see `tc` below. Every one of the 30+ other
   * callers of this shared component omits this prop entirely, so `tc`
   * degenerates to a pure passthrough and their rendering is byte-for-byte
   * unchanged. Government/dynamic facility data is never routed through
   * `tc` — only the small set of config-authored UI strings are.
   */
  slug?: string;
}) {
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
    charityFilter,
    extraFields,
  } = config;

  const { t, locale } = useLanguage();
  // Issue #487: a hyphenated slug ("public-toilets", "cool-spots",
  // "tourism-factories") must become camelCase before it's used as a
  // dictionary namespace segment — a bare `${slug}Tool` would build
  // "public-toiletsTool.title", which can never match the real
  // "publicToiletsTool" key any dictionary file defines (JS/JSON object
  // keys don't contain hyphens here), silently falling through to the zh
  // `fallback` on every lookup. This was `#486`'s shipped behavior for
  // "public-toilets" specifically (its `publicToiletsTool.*` dictionary
  // entries exist with real translations but were never actually reachable)
  // — fixed here rather than left in place, since this ticket's own
  // "cool-spots"/"tourism-factories" slugs would hit the exact same bug.
  const toCamelCase = (s: string): string => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
  // Issue #486: pure passthrough when `slug` is omitted (every pre-existing
  // caller) — `tc` then always returns `fallback` unchanged, so those 30+
  // other /tools pages render byte-for-byte as before. When `slug` is set,
  // looks up `${camelCase(slug)}Tool.<key>` with the config's own Chinese
  // string as the dictionary fallback.
  const tc = (key: string, fallback: string): string =>
    slug ? t(`${toCamelCase(slug)}Tool.${key}`, fallback) : fallback;

  // Issue #486/#487: localized display copies of the config's own strings.
  // `facilityNoun()` below is still fed the RAW `emptyStateNoKeyword`/`title`
  // (its regex is zh-specific and can't parse a translated string) — its
  // result then goes through `tc("noun", ...)` itself, so a tool with no
  // translated noun of its own still gets the exact same zh noun as before,
  // never a half-translated one. `MapLocationBanner`'s `facilityTypeName`
  // DOES get the translated `displayTitle` (see below) now that issue #487
  // translated that component's own sentence templates too.
  const displayTitle = tc("title", title);
  const displayDescription = tc("description", description);
  const displayNoteLine = noteLine ? tc("noteLine", noteLine) : noteLine;
  const displaySearchPlaceholder = tc("searchPlaceholder", searchPlaceholder);
  const displayErrorText = tc("errorText", errorText);
  const displayEmptyStateNoKeyword = tc("emptyStateNoKeyword", emptyStateNoKeyword);
  const displayEmptyStateWithKeyword = tc("emptyStateWithKeyword", emptyStateWithKeyword);
  // `locationDefaultWarning` itself is pre-existing dead config (destructured
  // above but never rendered anywhere in this component, independently of
  // this ticket) — nothing to wrap in `tc` since there's no render site for
  // it today.
  const displayCategories = categories?.map((c, idx) => ({
    ...c,
    label: tc(`categoryLabel${idx}`, c.label),
  }));
  const displayCharityFilterLabel = charityFilter ? tc("charityFilterLabel", charityFilter.label) : undefined;
  const displayExtraFields = extraFields?.map((f, idx) => ({
    ...f,
    label: tc(`extraFieldLabel${idx}`, f.label),
  }));

  // issue #463：地圖彈出視窗「看附近的 AED／急診／藥局」深連結帶入的 ?lat=&lng=
  // 覆寫座標，由呼叫端（目前只有 /tools/pharmacies，一個 server component）在
  // page.tsx 解析 searchParams 後往下傳——FacilitySearchContent 被 30 個以上的
  // /tools 頁面共用，刻意不在這裡自己呼叫 useSearchParams()，避免逼著其他 29
  // 個跟這張票無關的頁面也要補上 Suspense 邊界才能繼續 build。
  //
  // issue #478：改用共用的 useSharedGeolocation()。有效覆寫座標存在時傳入
  // `skip: true`——跳過瀏覽器定位整個流程（不讀快取、不呼叫
  // getCurrentPosition），完全不觸發定位權限彈窗，維持 override 原本「完全略
  // 過瀏覽器定位」的語意；沒有提供 override 時行為不變。
  const hasOverride = isValidGeolocationOverride(locationOverride);
  const geolocation = useSharedGeolocation({ skip: hasOverride });
  // useMemo 讓 override 模式下也有一個跨渲染穩定的物件參照（不會每次 render
  // 都產生新物件），否則下面依賴 effectiveCoords 的 useEffect 會在每次渲染
  // 都誤判為「座標變了」而重新發起請求。
  const geoCoords = useMemo(
    () => (hasOverride ? { lat: locationOverride!.lat, lng: locationOverride!.lng } : geolocation.coords),
    [hasOverride, locationOverride, geolocation.coords],
  );
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [county, setCounty] = useState("");
  const [district, setDistrict] = useState("");
  const [category, setCategory] = useState("");
  const [onlyCharity, setOnlyCharity] = useState(false);
  const [sort, setSort] = useState<"distance" | "newest" | "name" | "category">("distance");
  const [facilities, setFacilities] = useState<FacilityItem[] | null>(null);
  /** Size of the filtered dataset matching current query, used for Pagination. */
  const [total, setTotal] = useState<number | null>(null);
  /** Size of the whole dataset for this facility type. */
  const [allTotal, setAllTotal] = useState<number | null>(null);
  /** True when the rendered list came from the widened fallback radius rather than the configured one. */
  const [widenedRadius, setWidenedRadius] = useState(false);
  /** Number of results found in the initial radius before widening. */
  const [initialNearbyCount, setInitialNearbyCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Issue #157 / #312: 支援 30 / 50 / 100 分頁器，與後端 API 伺服器端分頁對齊
  const { page, pageSize, setPage, setPageSize, offset } = usePagination();

  // If keyword or county search is active, and distance sort is selected but no coords available,
  // fall back gracefully
  const effectiveSort = sort;

  // issue #478：使用者手動選擇的縣市（既有的「地區快篩」功能）本身就是一個
  // 明確的手動定位 fallback——不需要再另外加一個縣市選擇器。優先順序：GPS／
  // override 座標 > 使用者選擇的縣市中心點 > null（兩者都沒有時絕不套用任何
  // 預設座標，交由 MapLocationBanner 顯示「請使用上方地區篩選」的提示）。
  const countyCentroid = county && TAIWAN_COUNTY_CENTROIDS[county] ? TAIWAN_COUNTY_CENTROIDS[county] : null;
  const effectiveCoords = geoCoords ?? countyCentroid;

  useEffect(() => {
    let cancelled = false;

    const load = async (radius: number): Promise<{ facilities: FacilityItem[]; total?: number; allTotal?: number }> => {
      const params = new URLSearchParams({
        type: facilityType,
        limit: String(pageSize),
        offset: String(offset),
        page: String(page),
      });

      if (keyword) params.set("keyword", keyword);
      if (county) params.set("county", county);
      if (district) params.set("district", district);
      if (category) params.set("category", category);
      if (onlyCharity) params.set("charity", "1");
      if (effectiveSort) params.set("sort", effectiveSort);

      // Coordinates for distance calculations: county centroid takes priority
      // (search-filter semantics), else the GPS/override coordinate; neither
      // present just omits lat/lng (the API falls back to id-DESC ordering,
      // see lib/server/facilities/queries.ts's isGpsSearch guard).
      if (effectiveSort === "distance" && effectiveCoords) {
        params.set("lat", String(effectiveCoords.lat));
        params.set("lng", String(effectiveCoords.lng));
        // Radius constraint applies only when purely browsing nearby without specific county/district/keyword
        if (!county && !district && !keyword) {
          params.set("radius", String(radius));
        }
      }

      const res = await fetchWithTimeout(`/api/facilities?${params.toString()}`, { timeoutMs: 5000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };

    (async () => {
      try {
        setLoading(true);
        let data = await load(radiusMeters);
        let widened = false;
        let originalCount: number | null = null;

        // In nearby distance mode without filters, widen if radius yielded 0 results
        if (!keyword && !county && !district && effectiveSort === "distance" && data.facilities.length === 0) {
          originalCount = data.facilities.length;
          const widenedData = await load(NEARBY_FALLBACK_RADIUS_METERS);
          if (widenedData.facilities.length > data.facilities.length) {
            data = widenedData;
            widened = true;
          }
        }

        if (!cancelled) {
          setFacilities(data.facilities);
          setTotal(typeof data.total === "number" ? data.total : null);
          setAllTotal(typeof data.allTotal === "number" ? data.allTotal : null);
          setWidenedRadius(widened);
          setInitialNearbyCount(widened ? originalCount : null);
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
  }, [
    effectiveCoords,
    keyword,
    county,
    district,
    facilityType,
    radiusMeters,
    category,
    onlyCharity,
    effectiveSort,
    pageSize,
    offset,
    page,
  ]);

  const handleCountyChange = (c: string) => {
    setCounty(c);
    setDistrict("");
    setPage(1);
  };

  const handleDistrictChange = (d: string) => {
    setDistrict(d);
    setPage(1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    setKeyword(trimmed);
    setPage(1);
  };

  const handleResetAll = () => {
    setKeyword("");
    setSearchInput("");
    setCounty("");
    setDistrict("");
    setCategory("");
    setOnlyCharity(false);
    setSort("distance");
    setPage(1);
  };

  const pagedFacilities = facilities ?? [];
  const geocoded = pagedFacilities.filter((f): f is FacilityItem & { lat: number; lng: number } => f.lat !== null && f.lng !== null);
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

  // Issue #487: the noun itself is now also tc()-resolved — scoped per-slug
  // exactly like every other `display*` override above, so a tool with no
  // `${slug}Tool.noun` dictionary entry (every pre-existing one, including
  // #486's clinics/pharmacies/public-toilets) gets the exact same
  // `facilityNoun()`-derived zh noun as before (`tc` passes the fallback
  // through unchanged), while a tool that DOES define one (cool-spots,
  // tourism-factories) gets a real translated noun to interpolate below.
  const noun = tc("noun", facilityNoun(emptyStateNoKeyword, title));
  const nearestKm = pagedFacilities.reduce((min, f) => {
    const km = Number(f.distance_km);
    return Number.isFinite(km) && km < min ? km : min;
  }, Infinity);
  // Issue #487: also tc()-scoped — a tool with no `${slug}Tool.*` override
  // for these two keys renders the exact same hardcoded zh sentence as
  // before (interpolating the zh `noun` above), so mixing a translated
  // template with an untranslated noun (or vice versa) can't happen; only a
  // tool that defines BOTH together ever sees a translated sentence.
  // Not tc()-scoped (unlike fallbackNoticeSome/None below): this fragment
  // never embeds `noun`, just a km number, so there's no mixed-language
  // risk in sharing one generic translation across every tool immediately.
  const nearestText = Number.isFinite(nearestKm)
    ? t("facilitySearch.nearestSuffixTemplate", "（最近一處約 {km} 公里）").replace("{km}", String(Math.round(nearestKm)))
    : "";
  const fallbackNotice = widenedRadius
    ? (initialNearbyCount && initialNearbyCount > 0
        ? tc(
            "fallbackNoticeSome",
            "您附近 {radius} 公里內僅有 {count} 處{noun}，已自動依距離為您列出全台最近的{noun}{nearestText}。",
          )
            .replace("{radius}", String(radiusMeters / 1000))
            .replace("{count}", String(initialNearbyCount))
            .replace(/\{noun\}/g, noun)
            .replace("{nearestText}", nearestText)
        : tc(
            "fallbackNoticeNone",
            "您附近 {radius} 公里內沒有{noun}，以下依距離列出最近的{noun}{nearestText}。",
          )
            .replace("{radius}", String(radiusMeters / 1000))
            .replace(/\{noun\}/g, noun)
            .replace("{nearestText}", nearestText))
    : null;

  const totalCount = total !== null ? total : pagedFacilities.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">
          {emoji} {displayTitle}
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">{displayDescription}</p>
        {displayNoteLine && <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">{displayNoteLine}</p>}
      </div>

      {facilityType === "clinic" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50/70 p-3.5 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-center gap-2 font-medium">
            <span className="text-base">🚨</span>
            <span>
              {t("facilitySearch.emergencyBannerPrefix", "突發重症、劇烈胸痛或危及生命情況？請立即撥打 ")}
              <strong>119</strong>
              {t("facilitySearch.emergencyBannerSuffix", " 或查詢即時急診壅塞狀況。")}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/tools/er-status"
              className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2.5 py-1 font-semibold text-red-800 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-200"
            >
              <span>{t("facilitySearch.erBannerLinkLabel", "🚑 全台急診即時看板 ↗")}</span>
            </a>
            <a
              href="/tools/aed"
              className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2.5 py-1 font-semibold text-rose-800 hover:bg-rose-200 dark:bg-rose-900/50 dark:text-rose-200"
            >
              <span>{t("facilitySearch.aedBannerLinkLabel", "⚡ AED 急救地圖 ↗")}</span>
            </a>
          </div>
        </div>
      )}

      {facilityType === "addiction_treatment" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-teal-200 bg-teal-50/70 p-3.5 text-xs text-teal-900 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300">
          <div className="flex items-center gap-2 font-medium">
            <span className="text-base">☎️</span>
            <span>
              {t("facilitySearch.addictionHotlinePrefix", "想戒毒或擔心家人藥癮問題？歡迎撥打法務部戒毒成功專線 ")}
              <a href={`tel:${ADDICTION_HOTLINE.replace(/-/g, "")}`} className="font-bold underline">
                {ADDICTION_HOTLINE}
              </a>
              {t("facilitySearch.addictionHotlineSuffix", "（24 小時免付費）。")}
            </span>
          </div>
        </div>
      )}

      {/* 結構化篩選面板：縣市鄉鎮二級聯動 ＋ 關鍵字 ＋ 類別 ＋ 排序 */}
      <form onSubmit={handleSearch} className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/60 shadow-xs">
        {/* 第一列：22 縣市＋368 鄉鎮二級快速篩選 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-600 dark:text-slate-300 shrink-0">
            <span>{t("facilitySearch.regionQuickFilterLabel", "📍 地區快篩：")}</span>
          </div>
          <CountyDistrictPicker
            county={county}
            district={district}
            onCountyChange={handleCountyChange}
            onDistrictChange={handleDistrictChange}
            className="flex-1"
          />
        </div>

        {/* 第二列：關鍵字、類別、排序與操作按鈕 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={displaySearchPlaceholder}
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-800 shadow-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {displayCategories && displayCategories.length > 0 && (
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              aria-label={t("facilitySearch.categoryFilterAriaLabel", "業務分類篩選")}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 shadow-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">{t("facilitySearch.allCategories", "全部分類")}</option>
              {displayCategories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          )}

          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as typeof sort);
              setPage(1);
            }}
            aria-label={t("facilitySearch.sortAriaLabel", "排序方式")}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 shadow-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="distance">{t("facilitySearch.sortDistance", "📍 距離最近")}</option>
            <option value="newest">{t("facilitySearch.sortNewest", "✨ 最新登記")}</option>
            <option value="name">{t("facilitySearch.sortName", "🔤 名稱筆畫")}</option>
            {categories && categories.length > 0 && <option value="category">{t("facilitySearch.sortCategory", "🏷️ 依業務分類")}</option>}
          </select>

          {charityFilter && (
            <label className="flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={onlyCharity}
                onChange={(e) => {
                  setOnlyCharity(e.target.checked);
                  setPage(1);
                }}
                className="h-4 w-4 accent-primary"
              />
              {displayCharityFilterLabel}
            </label>
          )}

          <button
            type="submit"
            className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-primaryho"
          >
            {t("facilitySearch.searchButton", "搜尋")}
          </button>

          {(keyword || county || district || category || onlyCharity || searchInput) && (
            <button
              type="button"
              onClick={handleResetAll}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {t("facilitySearch.resetButton", "重設")}
            </button>
          )}
        </div>
      </form>

      <MapLocationBanner
        geolocation={geolocation}
        hasManualCoords={Boolean(countyCentroid)}
        showPicker={false}
        // Issue #487: MapLocationBanner's own sentence templates are now
        // translated (t()-based, see that component), so this must feed it
        // `displayTitle` (tc()-resolved) rather than the raw zh `title` —
        // otherwise an English/Japanese/Korean sentence would end up with a
        // Chinese noun stuck in the middle of it.
        facilityTypeName={displayTitle || t("facilitySearch.defaultFacilityTypeName", "機構據點")}
      />

      {loading && (
        <div className="flex justify-center py-8">
          <LoadingOrb size={32} />
        </div>
      )}

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{displayErrorText}</div>}

      {!loading && !error && facilities && (
        <>
          {markers.length > 0 && effectiveCoords && (
            <div className="h-[400px] overflow-hidden rounded-xl border border-neutral-200 dark:border-slate-800">
              <FacilityMap
                userLocation={{ lat: effectiveCoords.lat, lng: effectiveCoords.lng, isDefault: false, refresh: geolocation.refresh }}
                markers={markers}
                radiusMeters={radiusMeters}
                showRadius={!keyword && !county && !district && effectiveSort === "distance" && !widenedRadius}
              />
            </div>
          )}

          {fallbackNotice && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{fallbackNotice}</p>
          )}

          {totalCount === 0 ? (
            <p className="py-8 text-center text-neutral-500 dark:text-slate-400">{keyword || county ? displayEmptyStateWithKeyword : displayEmptyStateNoKeyword}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500 dark:text-slate-400">
                <span>
                  {t("facilitySearch.resultsFoundPrefix", "共找到 ")}
                  <strong>{totalCount}</strong>
                  {t("facilitySearch.resultsFoundSuffix", " 筆")}
                  {allTotal !== null && allTotal > 0 &&
                    t("facilitySearch.allTotalTemplate", "（全台共收錄 {count} 筆）").replace("{count}", String(allTotal))}
                  {t("facilitySearch.pageInfoTemplate", "・第 {page} 頁（每頁 {pageSize} 筆）")
                    .replace("{page}", String(page))
                    .replace("{pageSize}", String(pageSize))}
                </span>
              </div>

              {pagedFacilities.map((f) => (
                <div key={f.id} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-neutral-800 dark:text-slate-100">{f.name}</p>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {f.extra_json?.penalty && <FacilityPenaltyBadge penalty={f.extra_json.penalty} />}
                      {facilityType === "clinic" && f.name.includes("醫院") && (
                        <a
                          href={`/tools/er-status?q=${encodeURIComponent(f.name.replace(/附設.*?醫院|醫療財團法人|醫療社團法人/g, "").slice(0, 4))}`}
                          className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 border border-red-200 hover:bg-red-100 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300"
                          title="查看該院急診即時壅塞資訊與等候走勢"
                        >
                          <span>🚑 急診看板 ↗</span>
                        </a>
                      )}
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
                      {f.extra_json?.abcLevel && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          f.extra_json.abcLevel === "A"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                            : f.extra_json.abcLevel === "B"
                            ? "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                        }`}>
                          {f.extra_json.abcLevel === "A" ? "A 級旗艦" : f.extra_json.abcLevel === "B" ? "B 級特約" : "C 級巷弄站"}
                        </span>
                      )}
                      {f.extra_json?.emptySeats !== undefined && f.extra_json?.emptySeats !== null && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          f.extra_json.emptySeats === "滿床" || f.extra_json.emptySeats === 0
                            ? "bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-300"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
                        }`}>
                          <span>🛏️</span>
                          <span>
                            {f.extra_json.emptySeats === "滿床"
                              ? "滿床"
                              : `空床 ${f.extra_json.emptySeats} 床${f.extra_json.openBeds ? `（總 ${f.extra_json.openBeds} 床）` : ""}`}
                          </span>
                        </span>
                      )}
                      {f.extra_json?.evaluations && f.extra_json.evaluations.length > 0 && (() => {
                        const ev = f.extra_json?.evaluations?.[0];
                        if (!ev) return null;
                        // issue #612: 合格效期 is now stored as an ISO date
                        // (YYYY-MM-DD) for the newer nhplatform-sourced
                        // facility types (postpartum_care, and long_term_care's
                        // 一般護理之家/居家護理所 categories). Older sources
                        // (e.g. the ltc-gis import) still store a raw
                        // Minguo-format string there, which this regex never
                        // matches — so those rows keep their original amber
                        // badge with no validity suffix, unchanged.
                        const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(ev.validUntil || "");
                        const isExpired = isIsoDate && ev.validUntil < new Date().toISOString().slice(0, 10);
                        const badgeClass = !isIsoDate
                          ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300"
                          : isExpired
                            ? "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300";
                        return (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}
                            title={ev.validUntil ? `有效期限：${ev.validUntil}` : undefined}
                          >
                            <span>🏅</span>
                            <span>
                              評鑑 {ev.year ? `${ev.year}年 ` : ""}{ev.result}
                              {isIsoDate ? (isExpired ? "・已過期" : "・效期內") : ""}
                            </span>
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  {f.address && (
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-sm text-neutral-600 dark:text-slate-300">{f.address}</p>
                      {/* Issue #486: scoped to slug-enabled (currently
                          clinics/pharmacies/public-toilets) pages only —
                          intentionally not turned on for the other 30+
                          facility pages sharing this component, to keep
                          their rendering byte-for-byte unchanged. */}
                      {slug && (
                        <CopyAddressButton
                          address={f.address}
                          className="shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-zumthor dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                        />
                      )}
                    </div>
                  )}
                  {f.phone && <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">📞 {f.phone}</p>}
                  {f.extra_json?.serviceDistrict && (
                    <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                      📍 服務區域：{f.extra_json.serviceDistrict}
                      {f.extra_json.serviceObject ? ` ｜ 服務對象：${f.extra_json.serviceObject}` : ""}
                    </p>
                  )}
                  {typeof serviceItem === "object" && f.service_item && (
                    <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                      {tc("serviceItemLabel", serviceItem.label)}
                      {f.service_item}
                    </p>
                  )}
                  {displayExtraFields?.map((ef) => {
                    const value = f.extra_json?.[ef.key];
                    if (!value) return null;
                    return (
                      <p key={ef.key} className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                        {ef.label}
                        {String(value)}
                      </p>
                    );
                  })}
                  {showWeeklyHours && <WeeklyHoursLine weeklyHours={f.extra_json?.weeklyHours} note={f.extra_json?.weeklyHoursNote} />}
                  {f.extra_json?.penalty && <FacilityPenaltyAccordion penalty={f.extra_json.penalty} />}
                  {showGeocodeNote && f.lat === null && (
                    <p className="mt-1 text-xs text-neutral-400 dark:text-slate-500">
                      {t("facilitySearch.notGeocodedNote", "（尚未完成地理定位，暫不顯示於地圖）")}
                    </p>
                  )}

                  {/* Google 地圖導航按鈕 */}
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 dark:border-slate-800">
                    <a
                      href={buildGoogleMapsDirUrl({
                        name: f.name,
                        address: f.address,
                        lat: f.lat,
                        lng: f.lng,
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750"
                    >
                      <span>{getNavigationButtonLabel(locale)}</span>
                      <span className="text-[10px] text-slate-400">↗</span>
                    </a>
                  </div>
                </div>
              ))}
              <Pagination
                page={page}
                pageSize={pageSize}
                totalItems={totalCount}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel={t("facilitySearch.itemLabelTemplate", "筆{noun}").replace("{noun}", noun)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
