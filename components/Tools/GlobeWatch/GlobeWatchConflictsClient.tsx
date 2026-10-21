"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useLanguage } from "@/app/context/LanguageContext";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import { detectWebglSupport, defaultWebglProbe } from "@/lib/tools/globeWatch/webgl";
import type { ConflictsGlobeData } from "@/lib/tools/globeWatch/conflictsTransform";
import GlobeWatchStatusPanel from "./GlobeWatchStatusPanel";

// Same dynamic-import gating convention as every other Global Watch client
// wrapper (GlobeWatchClient.tsx / GlobeWatchTyphoonsClient.tsx): MapLibre is
// only ever requested once the WebGL probe below resolves true.
const GlobeWatchConflictsGlobe = dynamic(() => import("./GlobeWatchConflictsGlobe"), {
  ssr: false,
  loading: () => <GlobeWatchStatusPanel variant="loading" message="地球載入中…" />,
});

/**
 * Issue #774 (parent #773) — orchestrates the 武裝衝突 (conflicts) item's
 * globe frame. `data` is computed server-side (GDELT rows through
 * lib/tools/globeWatch/conflictsTransform.ts's buildConflictsGlobeData, same
 * pattern GlobeWatchTyphoonsClient.tsx already uses) and passed down as a
 * plain serializable prop — the list is rendered by the caller
 * (GlobeWatchConflictsItem.tsx) and is genuinely server-rendered.
 *
 * `data.emptyState` is true when GDELT currently has no CAMEO 19/20 event —
 * the interactive globe is never mounted in that case; the same
 * GlobeWatchStatusPanel frame used for "loading"/"unsupported" renders its
 * "empty" variant instead, so the outer frame's shape never changes across
 * any of the four states (no CLS), same contract as the typhoons item.
 */
export default function GlobeWatchConflictsClient({ data }: { data: ConflictsGlobeData }) {
  const { locale } = useLanguage();
  const reducedMotion = usePrefersReducedMotion();
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);

  useEffect(() => {
    queueMicrotask(() => setWebglSupported(detectWebglSupport(defaultWebglProbe)));
  }, []);

  const popupLabels = {
    readOriginalLabel: "閱讀原文 ↗",
    unknownCountryLabel: "未知地點",
    fatalitiesLabel: "估計傷亡：",
  };

  return (
    <div
      className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900"
      data-testid="globe-watch-conflicts-frame"
    >
      {webglSupported === true && !data.emptyState && (
        <GlobeWatchConflictsGlobe locale={locale} reducedMotion={reducedMotion} data={data} popupLabels={popupLabels} />
      )}
      {webglSupported === true && data.emptyState && (
        <GlobeWatchStatusPanel variant="empty" message="⚔️ 目前 GDELT 無符合篩選條件的衝突事件。" />
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
