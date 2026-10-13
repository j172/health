"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSharedGeolocation } from "@/lib/hooks/useSharedGeolocation";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import { NEARBY_DEFAULT_TYPES, NEARBY_MORE_TYPES } from "@/lib/server/nearby/registry";
import { TAIWAN_COUNTY_CENTROIDS } from "@/lib/constants/taiwanDistricts";
import CountyDistrictPicker from "@/components/Facilities/CountyDistrictPicker";
import { useLanguage } from "@/app/context/LanguageContext";
import { getLocalizedNearbyLabel } from "@/lib/i18n/nearbyLabelContent";
import { isPathLocale } from "@/lib/i18n/dictionary";

/**
 * Client-owned geolocation + fetching for "/nearby" (issue #466). Mirrors
 * this repo's established "server page.tsx does nothing async, client
 * component owns geolocation+fetching" split (see CareCircleMap.tsx /
 * FacilitySearchContent.tsx).
 *
 * Geolocation hook: `useSharedGeolocation` (issue #477), not the older
 * `components/Facilities/useGeolocation.ts` — the older hook silently falls
 * back to a fixed Taipei-101 default on denial/timeout (the exact bug class
 * issue #466 explicitly must not reintroduce; see the 2026-09-09 incident).
 * `useSharedGeolocation` instead reports an explicit terminal status
 * (`denied`/`timeout`/`unsupported`) via `needsManualSelection`, which this
 * component uses to show the manual county picker below instead of ever
 * guessing a coordinate on the user's behalf.
 */

interface NearbyItem {
  id: string | number;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
  extra?: Record<string, unknown>;
}

interface NearbyTypeResult {
  key: string;
  label: string;
  emoji: string;
  status: "ok" | "error";
  items: NearbyItem[];
  error?: string;
}

interface NearbyApiResponse {
  results: NearbyTypeResult[];
  unknownKeys: string[];
}

const DEFAULT_TYPE_KEYS = NEARBY_DEFAULT_TYPES.map((def) => def.key);

type Translator = (key: string, defaultValue?: string) => string;

function formatDistance(distanceKm: number | null, t: Translator): string {
  if (distanceKm === null || !Number.isFinite(distanceKm)) return "";
  return distanceKm < 1
    ? t("nearbyPage.distanceMetersTemplate", "{value} 公尺").replace("{value}", String(Math.round(distanceKm * 1000)))
    : t("nearbyPage.distanceKmTemplate", "{value} 公里").replace("{value}", distanceKm.toFixed(1));
}

function TypeResultCard({
  result,
  locale,
  t,
}: {
  result: NearbyTypeResult;
  locale: ReturnType<typeof useLanguage>["locale"];
  t: Translator;
}) {
  // Issue #487: the API returns `label` in Chinese (it comes straight from
  // the NearbyTypeDef registry) — on a /en//ja//ko/ page, re-resolve the
  // display label from the translated registry (lib/i18n/nearbyLabelContent.ts)
  // instead of showing that raw zh string, so "/nearby" is never a silent
  // Chinese fallback on a translated locale.
  const displayLabel = isPathLocale(locale) ? getLocalizedNearbyLabel(result.key, locale, result.label) : result.label;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-2 flex items-center gap-1.5 text-base font-bold text-neutral-800 dark:text-slate-100">
        <span aria-hidden="true">{result.emoji}</span>
        <span>{displayLabel}</span>
      </h3>

      {result.status === "error" ? (
        <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {t("nearbyPage.queryFailed", "查詢失敗，請稍後再試。")}
        </p>
      ) : result.items.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-slate-400">
          {t("nearbyPage.cardEmptyTemplate", "附近查無收錄的{label}。").replace("{label}", displayLabel)}
        </p>
      ) : (
        <ul className="space-y-2">
          {result.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-neutral-800 dark:text-slate-100">{item.name}</p>
                {item.address ? (
                  <p className="truncate text-xs text-neutral-500 dark:text-slate-400">{item.address}</p>
                ) : null}
              </div>
              {item.distanceKm !== null ? (
                <span className="shrink-0 whitespace-nowrap rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                  {formatDistance(item.distanceKm, t)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function NearbyContent() {
  const { locale, t } = useLanguage();
  const geolocation = useSharedGeolocation();
  const [manualCounty, setManualCounty] = useState("");
  const [manualDistrict, setManualDistrict] = useState("");

  const [defaultResults, setDefaultResults] = useState<NearbyTypeResult[] | null>(null);
  const [defaultLoading, setDefaultLoading] = useState(false);
  const [defaultError, setDefaultError] = useState(false);

  const [moreExpanded, setMoreExpanded] = useState(false);
  const [moreResults, setMoreResults] = useState<Record<string, NearbyTypeResult>>({});
  const [loadingMoreKeys, setLoadingMoreKeys] = useState<Set<string>>(new Set());

  // The chosen county's centroid (lib/constants/taiwanDistricts.ts) — a pure derivation from
  // manualCounty, only computed once the user has actually picked one through the manual
  // fallback below. Never applied automatically, so a denied/timeout/unsupported geolocation
  // result never silently gets a location substituted for it.
  const manualCoords = useMemo(() => {
    if (!manualCounty) return null;
    const centroid = TAIWAN_COUNTY_CENTROIDS[manualCounty];
    return centroid ? { lat: centroid.lat, lng: centroid.lng } : null;
  }, [manualCounty]);

  const effectiveCoords = geolocation.coords ?? manualCoords;

  useEffect(() => {
    if (!effectiveCoords) return;
    let cancelled = false;

    (async () => {
      try {
        setDefaultLoading(true);
        setDefaultError(false);
        const params = new URLSearchParams({
          lat: String(effectiveCoords.lat),
          lng: String(effectiveCoords.lng),
          types: DEFAULT_TYPE_KEYS.join(","),
          limit: "3",
        });
        const res = await fetchWithTimeout(`/api/nearby?${params.toString()}`, { timeoutMs: 8000 });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: NearbyApiResponse = await res.json();
        if (!cancelled) {
          setDefaultResults(Array.isArray(data.results) ? data.results : []);
        }
      } catch {
        if (!cancelled) {
          setDefaultError(true);
          setDefaultResults(null);
        }
      } finally {
        if (!cancelled) setDefaultLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveCoords]);

  const loadMoreType = async (key: string) => {
    if (!effectiveCoords || moreResults[key] || loadingMoreKeys.has(key)) return;
    setLoadingMoreKeys((prev) => new Set(prev).add(key));
    try {
      const params = new URLSearchParams({
        lat: String(effectiveCoords.lat),
        lng: String(effectiveCoords.lng),
        types: key,
        limit: "3",
      });
      const res = await fetchWithTimeout(`/api/nearby?${params.toString()}`, { timeoutMs: 8000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: NearbyApiResponse = await res.json();
      const result = data.results?.[0];
      if (result) {
        setMoreResults((prev) => ({ ...prev, [key]: result }));
      }
    } catch {
      const fallback = NEARBY_MORE_TYPES.find((def) => def.key === key);
      if (fallback) {
        setMoreResults((prev) => ({
          ...prev,
          [key]: { key, label: fallback.label, emoji: fallback.emoji, status: "error", items: [] },
        }));
      }
    } finally {
      setLoadingMoreKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const showManualFallback = geolocation.needsManualSelection && !manualCoords;

  const manualFallbackReason = useMemo(() => {
    if (geolocation.status === "denied") return t("nearbyPage.manualReasonDenied", "您已拒絕定位授權。");
    if (geolocation.status === "timeout") return t("nearbyPage.manualReasonTimeout", "定位逾時，無法取得您目前的位置。");
    if (geolocation.status === "unsupported") return t("nearbyPage.manualReasonUnsupported", "您的瀏覽器不支援定位功能。");
    return t("nearbyPage.manualReasonDefault", "無法取得您目前的位置。");
  }, [geolocation.status, t]);

  const resolveTypeLabel = (key: string, fallbackLabel: string): string =>
    isPathLocale(locale) ? getLocalizedNearbyLabel(key, locale, fallbackLabel) : fallbackLabel;

  return (
    <div className="space-y-8">
      {geolocation.awaitingPermission && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {t("nearbyPage.awaitingPermission", "請在瀏覽器的定位授權彈出視窗中選擇「允許」，才能查詢您附近的急用點位。")}
        </div>
      )}

      {!effectiveCoords && (geolocation.status === "idle" || geolocation.status === "locating") && (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {t("nearbyPage.locating", "正在為您定位…")}
        </div>
      )}

      {showManualFallback && (
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {manualFallbackReason}
            {t("nearbyPage.manualPromptSuffix", "請改選您所在的縣市，以便查詢附近的急用點位。")}
          </p>
          <CountyDistrictPicker
            county={manualCounty}
            district={manualDistrict}
            onCountyChange={setManualCounty}
            onDistrictChange={setManualDistrict}
          />
          <button
            type="button"
            onClick={geolocation.refresh}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-slate-800"
          >
            {t("nearbyPage.retryLocationButton", "🔄 重新嘗試定位")}
          </button>
        </div>
      )}

      {effectiveCoords && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-neutral-800 dark:text-slate-100">
            {t("nearbyPage.defaultSectionHeading", "8 類急用點位（最近 3 筆）")}
          </h2>
          {defaultLoading && !defaultResults ? (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {t("nearbyPage.queryingLoading", "查詢中…")}
            </div>
          ) : defaultError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {t("nearbyPage.queryFailed", "查詢失敗，請稍後再試。")}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {defaultResults?.map((result) => (
                <TypeResultCard key={result.key} result={result} locale={locale} t={t} />
              ))}
            </div>
          )}
        </section>
      )}

      {effectiveCoords && (
        <section>
          <button
            type="button"
            onClick={() => setMoreExpanded((v) => !v)}
            aria-expanded={moreExpanded}
            className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <span>{moreExpanded ? "▾" : "▸"}</span>
            <span>{t("nearbyPage.moreTypesToggle", "更多類型")}</span>
          </button>

          {moreExpanded && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {NEARBY_MORE_TYPES.map((def) => {
                  const loaded = Boolean(moreResults[def.key]);
                  const loading = loadingMoreKeys.has(def.key);
                  return (
                    <button
                      key={def.key}
                      type="button"
                      onClick={() => loadMoreType(def.key)}
                      disabled={loading}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        loaded
                          ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
                          : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      } disabled:cursor-wait disabled:opacity-60`}
                    >
                      {def.emoji} {resolveTypeLabel(def.key, def.label)}
                      {loading ? "…" : ""}
                    </button>
                  );
                })}
              </div>

              {Object.keys(moreResults).length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {Object.values(moreResults).map((result) => (
                    <TypeResultCard key={result.key} result={result} locale={locale} t={t} />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <p className="text-xs text-neutral-400 dark:text-slate-500">
        {t("nearbyPage.footerPrefix", "每類僅顯示最近 3 筆，完整列表與地圖可至各")}{" "}
        <Link href="/tools" className="underline hover:text-neutral-600 dark:hover:text-slate-300">
          {t("nearbyPage.footerLinkText", "設施查詢工具")}
        </Link>{" "}
        {t("nearbyPage.footerSuffix", "頁面查看。")}
      </p>
    </div>
  );
}
