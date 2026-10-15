"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useLanguage } from "@/app/context/LanguageContext";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import { detectWebglSupport, defaultWebglProbe } from "@/lib/tools/globeWatch/webgl";
import type { TyphoonsGlobeData } from "@/lib/tools/globeWatch/typhoonsTransform";
import GlobeWatchStatusPanel from "./GlobeWatchStatusPanel";

// Same dynamic-import gating convention as GlobeWatchClient.tsx (#587) and
// GlobeWatchEpidemicsClient.tsx (#589): MapLibre is only ever requested once
// the WebGL probe below resolves true.
const GlobeWatchTyphoonsGlobe = dynamic(() => import("./GlobeWatchTyphoonsGlobe"), {
  ssr: false,
  loading: () => <GlobeWatchStatusPanel variant="loading" message="地球載入中…" />,
});

/**
 * Issue #593 (parent #583) — orchestrates the 颱風 (typhoons) item's globe
 * frame. Unlike GlobeWatchEpidemicsClient.tsx, this component does NOT fetch
 * its own data client-side: `data` is computed server-side in
 * app/(zh|[locale])/tools/global-watch/typhoons/page.tsx (CWA + GDACS rows
 * through lib/tools/globeWatch/typhoonsTransform.ts's buildTyphoonsGlobeData,
 * same pattern GlobeWatchEarthquakesItem.tsx already uses) and passed down
 * as a plain serializable prop — so the list (rendered by the caller) is
 * genuinely server-rendered for SEO/LCP, and this component only ever
 * decides which of three mutually-exclusive visual states to show:
 * loading the WebGL probe, unsupported, or the globe/empty-state once it
 * resolves.
 *
 * AC: "沒有任何活動颱風時，顯示明確的『目前無活動中的熱帶氣旋』說明，而不是空白地圖" — when
 * `data.emptyState` is true, the interactive globe is never even mounted;
 * the same GlobeWatchStatusPanel frame used for "loading"/"unsupported" is
 * reused for this leaf case too (its own "empty" variant, added by this
 * ticket), so the outer frame's shape never changes across any of the four
 * states (no CLS) and a visitor reading the panel always gets an explicit
 * message rather than an interactive globe with nothing drawn on it.
 */
export default function GlobeWatchTyphoonsClient({ data }: { data: TyphoonsGlobeData }) {
  const { locale } = useLanguage();
  const reducedMotion = usePrefersReducedMotion();
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);

  useEffect(() => {
    queueMicrotask(() => setWebglSupported(detectWebglSupport(defaultWebglProbe)));
  }, []);

  const popupLabels = {
    westPacificLabel: "西太平洋（中央氣象署）",
    sourceLinkLabel: "詳細資訊 ↗",
  };

  return (
    <div
      className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900"
      data-testid="globe-watch-typhoons-frame"
    >
      {webglSupported === true && !data.emptyState && (
        <GlobeWatchTyphoonsGlobe locale={locale} reducedMotion={reducedMotion} data={data} popupLabels={popupLabels} />
      )}
      {webglSupported === true && data.emptyState && (
        <GlobeWatchStatusPanel variant="empty" message="🌀 目前無活動中的熱帶氣旋。" />
      )}
      {webglSupported === false && (
        <GlobeWatchStatusPanel
          variant="unsupported"
          message="您的瀏覽器或裝置目前不支援 WebGL，無法顯示互動式 3D 地球。下方清單仍可完整使用。"
        />
      )}
      {webglSupported === null && <GlobeWatchStatusPanel variant="loading" message="準備互動式地球…" />}
    </div>
  );
}
