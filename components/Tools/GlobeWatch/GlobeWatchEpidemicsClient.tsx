"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/app/context/LanguageContext";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import { detectWebglSupport, defaultWebglProbe } from "@/lib/tools/globeWatch/webgl";
import { buildEpidemicsGlobeData, findCountryGroup, type EpidemicAlertRow } from "@/lib/tools/globeWatch/epidemicsTransform";
import {
  buildWhoDonPinFeatures,
  filterVisibleWhoDonPins,
  findWhoDonPin,
  type WhoDonRow,
} from "@/lib/tools/globeWatch/whoDonTransform";
import GlobeWatchStatusPanel from "./GlobeWatchStatusPanel";
import GlobeWatchEpidemicsLegend from "./GlobeWatchEpidemicsLegend";
import GlobeWatchEpidemicsCountryPanel from "./GlobeWatchEpidemicsCountryPanel";
import GlobeWatchWhoDonPinPanel from "./GlobeWatchWhoDonPinPanel";

// Same dynamic-import gating convention as GlobeWatchClient.tsx (issue
// #587): MapLibre (and the country-boundary GeoJSON it fetches) is only
// ever requested once the WebGL probe below resolves true.
const GlobeWatchEpidemicsGlobe = dynamic(() => import("./GlobeWatchEpidemicsGlobe"), {
  ssr: false,
  loading: () => <GlobeWatchStatusPanel variant="loading" message="地球載入中…" />,
});

interface CdcAlertsApiResponse {
  ok: boolean;
  alerts?: Array<{
    id: string;
    iso: string;
    country: string;
    countryEn: string;
    disease: string;
    levelCode: number;
    severityLevel: string;
    instruction: string;
    web: string;
    lat: number | null;
    lng: number | null;
    effective?: string;
  }>;
}

interface WhoOutbreakNewsApiResponse {
  ok: boolean;
  articles?: WhoDonRow[];
}

/**
 * Issue #589 (parent #583) — orchestrates the 國際疫情 (epidemics) item:
 * fetches `cdc_travel_alerts` (the same `/api/cdc/travel-alerts` endpoint
 * `TravelEpidemicAlertsContent` already uses — no new API route needed),
 * runs the pure `buildEpidemicsGlobeData` transform, and renders the globe
 * + legend + click-to-see-country-detail panel. The carried-over
 * disease-search/pagination/news-feed list is a sibling of this component
 * on the page (see app/(zh)/tools/global-watch/epidemics/page.tsx), not
 * nested inside it — the list stays fully independent and usable even if
 * this component's globe never loads (AC: 不支援 WebGL 時清單維持完整可用).
 *
 * Issue #597 (parent #583) added the WHO Disease Outbreak News (DON) pin
 * overlay: fetches `who_outbreak_news` (the new `/api/who/outbreak-news`
 * route), runs the pure `buildWhoDonPinFeatures` transform, and renders a
 * "顯示 WHO 通報" toggle that drives `filterVisibleWhoDonPins` — the globe
 * component only ever sees the already-filtered list, so toggling off is
 * just "the WHO-pin source becomes empty," never touching the country
 * choropleth's own source/layer (AC: 關閉切換後圖釘從地球上消失，國家上色
 * 不受影響).
 */
export default function GlobeWatchEpidemicsClient() {
  const { locale } = useLanguage();
  const reducedMotion = usePrefersReducedMotion();
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [rows, setRows] = useState<EpidemicAlertRow[]>([]);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [whoRows, setWhoRows] = useState<WhoDonRow[]>([]);
  const [showWhoPins, setShowWhoPins] = useState(true);
  const [selectedWhoPinId, setSelectedWhoPinId] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => setWebglSupported(detectWebglSupport(defaultWebglProbe)));
  }, []);

  useEffect(() => {
    let ignore = false;
    fetch("/api/cdc/travel-alerts")
      .then((res) => res.json())
      .then((json: CdcAlertsApiResponse) => {
        if (ignore) return;
        if (!json.ok || !Array.isArray(json.alerts)) {
          setFetchError("無法載入疾管署旅遊疫情資料");
          return;
        }
        setRows(
          json.alerts.map((a) => ({
            id: a.id,
            iso: a.iso,
            country: a.country,
            countryEn: a.countryEn,
            disease: a.disease,
            levelCode: a.levelCode,
            severityLevel: a.severityLevel,
            instruction: a.instruction,
            web: a.web,
            lat: a.lat,
            lng: a.lng,
            effective: a.effective,
          })),
        );
      })
      .catch(() => {
        if (!ignore) setFetchError("無法連線至疾管署國際旅遊疫情資料庫");
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    fetch("/api/who/outbreak-news")
      .then((res) => res.json())
      .then((json: WhoOutbreakNewsApiResponse) => {
        if (ignore) return;
        if (!json.ok || !Array.isArray(json.articles)) return;
        setWhoRows(json.articles);
      })
      .catch(() => {
        // WHO DON fetch failing is non-fatal: the choropleth and the
        // carried-over list below are both unaffected, same resilience
        // posture as the cdc_travel_alerts fetch above.
      });
    return () => {
      ignore = true;
    };
  }, []);

  const globeData = useMemo(() => buildEpidemicsGlobeData(rows), [rows]);
  const selectedGroup = selectedIso ? findCountryGroup(globeData, selectedIso) : null;

  const whoPins = useMemo(() => buildWhoDonPinFeatures(whoRows), [whoRows]);
  const visibleWhoPins = useMemo(() => filterVisibleWhoDonPins(whoPins, showWhoPins), [whoPins, showWhoPins]);
  const selectedWhoPin = findWhoDonPin(visibleWhoPins, selectedWhoPinId);

  const handleSelectCountry = (iso: string | null) => {
    setSelectedIso(iso);
    if (iso) setSelectedWhoPinId(null);
  };
  const handleSelectWhoPin = (id: string | null) => {
    setSelectedWhoPinId(id);
    if (id) setSelectedIso(null);
  };

  return (
    <div>
      <div
        className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900"
        data-testid="globe-watch-epidemics-frame"
      >
        {webglSupported === true && (
          <GlobeWatchEpidemicsGlobe
            locale={locale}
            reducedMotion={reducedMotion}
            data={globeData}
            selectedIso={selectedIso}
            onSelectCountry={handleSelectCountry}
            whoPins={visibleWhoPins}
            onSelectWhoPin={handleSelectWhoPin}
          />
        )}
        {webglSupported === false && (
          <GlobeWatchStatusPanel
            variant="unsupported"
            message="您的瀏覽器或裝置目前不支援 WebGL，無法顯示互動式 3D 地球。下方清單仍可完整使用。"
          />
        )}
        {webglSupported === null && <GlobeWatchStatusPanel variant="loading" message="準備互動式地球…" />}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <GlobeWatchEpidemicsLegend legend={globeData.legend} />
        <button
          type="button"
          onClick={() => setShowWhoPins((v) => !v)}
          aria-pressed={showWhoPins}
          data-testid="who-don-pin-toggle"
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          🌐 {showWhoPins ? "顯示 WHO 通報：開" : "顯示 WHO 通報：關"}
        </button>
      </div>

      {fetchError && (
        <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">{fetchError}</p>
      )}

      {selectedGroup && (
        <GlobeWatchEpidemicsCountryPanel
          group={selectedGroup}
          locale={locale}
          onClose={() => setSelectedIso(null)}
        />
      )}

      {selectedWhoPin && (
        <GlobeWatchWhoDonPinPanel
          pin={selectedWhoPin}
          locale={locale}
          onClose={() => setSelectedWhoPinId(null)}
        />
      )}
    </div>
  );
}
