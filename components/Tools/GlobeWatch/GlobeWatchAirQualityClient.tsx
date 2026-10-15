"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useLanguage } from "@/app/context/LanguageContext";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import { detectWebglSupport, defaultWebglProbe } from "@/lib/tools/globeWatch/webgl";
import GlobeWatchStatusPanel from "./GlobeWatchStatusPanel";
import GlobeWatchAirQualityLegend from "./GlobeWatchAirQualityLegend";

// Same dynamic-import gating convention as GlobeWatchClient.tsx/
// GlobeWatchEpidemicsClient.tsx (issue #587): MapLibre is only ever
// requested once the WebGL probe below resolves true AND a token is
// actually configured — see the render logic below.
const GlobeWatchAirQualityGlobe = dynamic(() => import("./GlobeWatchAirQualityGlobe"), {
  ssr: false,
  loading: () => <GlobeWatchStatusPanel variant="loading" message="地球載入中…" />,
});

/**
 * Issue #598 (parent #583, phase 4) — orchestrates the 全球空品 (global air
 * quality) item: a WebGL probe gate (same convention as every other
 * global-watch item) plus a second gate on `waqiToken` actually being
 * configured. Unlike earthquakes/epidemics there is no server-fetched
 * dataset or pure transform here — per #583's own decision ("全球空品不經過
 * 這個模組的 features，只輸出圖例、署名與說明"), this component's only job is
 * the globe frame + legend; the attribution text, data explanation, and the
 * link to /tools/aqi all live in the page.tsx files (zh + [locale]), same
 * place GlobeWatchClient.tsx's own attribution text lives relative to its
 * page.
 */
export default function GlobeWatchAirQualityClient({ waqiToken }: { waqiToken: string | null }) {
  const { locale } = useLanguage();
  const reducedMotion = usePrefersReducedMotion();
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);

  useEffect(() => {
    // setState deferred to a microtask, same convention as GlobeWatchClient.tsx.
    queueMicrotask(() => setWebglSupported(detectWebglSupport(defaultWebglProbe)));
  }, []);

  const hasToken = Boolean(waqiToken);

  return (
    <div>
      <div
        className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900"
        data-testid="globe-watch-air-quality-frame"
      >
        {webglSupported === true && hasToken && waqiToken && (
          <GlobeWatchAirQualityGlobe locale={locale} reducedMotion={reducedMotion} token={waqiToken} />
        )}
        {webglSupported === true && !hasToken && (
          <GlobeWatchStatusPanel
            variant="unconfigured"
            message="全球空品圖磚尚未設定（缺少 WAQI_TOKEN），暫時無法顯示。"
          />
        )}
        {webglSupported === false && (
          <GlobeWatchStatusPanel
            variant="unsupported"
            message="您的瀏覽器或裝置目前不支援 WebGL，無法顯示互動式 3D 地球。"
          />
        )}
        {webglSupported === null && <GlobeWatchStatusPanel variant="loading" message="準備互動式地球…" />}
      </div>

      <GlobeWatchAirQualityLegend />
    </div>
  );
}
