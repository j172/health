"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useLanguage } from "@/app/context/LanguageContext";
import { usePrefersReducedMotion } from "@/lib/hooks/usePrefersReducedMotion";
import { detectWebglSupport, defaultWebglProbe } from "@/lib/tools/globeWatch/webgl";
import GlobeWatchStatusPanel from "./GlobeWatchStatusPanel";

// Issue #587 (parent #583): the only place in this feature that imports
// MapLibre at all — and only via `next/dynamic(..., { ssr: false })`, same
// convention as `components/DisasterMap/DisasterMapContent.tsx`'s
// `dynamic(() => import(".../DisasterMapLeaflet"), { ssr: false })`. Webpack
// puts `maplibre-gl` and everything GlobeWatchGlobe.tsx imports into its own
// chunk, which this `import()` call only fetches when actually rendered
// (AC: "MapLibre 以動態 import 載入，不出現在首次載入的 JS bundle"); see the
// render logic below for why that render only happens after a successful
// WebGL probe.
const GlobeWatchGlobe = dynamic(() => import("./GlobeWatchGlobe"), {
  ssr: false,
  loading: () => <GlobeWatchStatusPanel variant="loading" message="地球載入中…" />,
});

/**
 * Orchestrates the globe's loading states for `/tools/global-watch`
 * (AC checklist):
 * - WebGL probe result starts `null` ("checking") and is only resolved on
 *   the client, in an effect — so GlobeWatchGlobe's dynamic `import()` is
 *   never even requested while that probe is pending, and never at all when
 *   it comes back `false` (AC: "偵測不到 WebGL 時...不嘗試載入地球、不拋出錯誤").
 * - The outer frame below always keeps the exact same fixed aspect ratio
 *   across all three states (checking / unsupported / ready), which is what
 *   actually prevents layout shift once the real globe mounts inside it
 *   (AC: CLS / "固定長寬比佔位圖").
 */
export default function GlobeWatchClient() {
  const { locale } = useLanguage();
  const reducedMotion = usePrefersReducedMotion();
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);

  useEffect(() => {
    // setState deferred to a microtask (same convention as
    // components/Map/BaseMap.tsx's focusOnMarker effect) to avoid the
    // react-hooks/set-state-in-effect direct-call warning.
    queueMicrotask(() => setWebglSupported(detectWebglSupport(defaultWebglProbe)));
  }, []);

  return (
    <div
      className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900"
      data-testid="globe-watch-frame"
    >
      {webglSupported === true && <GlobeWatchGlobe locale={locale} reducedMotion={reducedMotion} />}
      {webglSupported === false && (
        <GlobeWatchStatusPanel
          variant="unsupported"
          message="您的瀏覽器或裝置目前不支援 WebGL，無法顯示互動式 3D 地球。"
        />
      )}
      {webglSupported === null && <GlobeWatchStatusPanel variant="loading" message="準備互動式地球…" />}
    </div>
  );
}
