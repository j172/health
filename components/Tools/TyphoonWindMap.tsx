import { appendOutboundUtm } from "@/lib/format/outboundLink";

const WINDY_ATTRIBUTION_UTM = { medium: "typhoon_wind_map", campaign: "typhoon_warning" } as const;

/**
 * Windy.com wind-map embed, shown only while a typhoon warning is in force
 * (issue: 颱風期間嵌入 Windy 風場地圖).
 *
 * Must use `embed.windy.com/embed2.html`, not the regular `www.windy.com`
 * interactive URL — the latter sends `Content-Security-Policy: frame-ancestors
 * 'self' *.windy.com:*`, which refuses to render inside any other site's
 * <iframe> (confirmed 2026-10-21 via a live response header check). The
 * `embed2.html` path is Windy's own iframe-embeddable widget and carries no
 * such restriction.
 *
 * Centered on 24.960, 121.239 (central Taiwan) at zoom 5 — wide enough to see
 * an approaching typhoon's full structure without the visitor having to pan.
 */
const WINDY_LAT = 24.96;
const WINDY_LON = 121.239;
const WINDY_ZOOM = 5;

const WINDY_EMBED_URL = `https://embed.windy.com/embed2.html?lat=${WINDY_LAT}&lon=${WINDY_LON}&zoom=${WINDY_ZOOM}&level=surface&overlay=wind&menu=&message=true&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`;

export default function TyphoonWindMap() {
  return (
    <section
      aria-labelledby="typhoon-wind-map-heading"
      className="rounded-2xl border border-red-200 bg-red-50/40 p-4 dark:border-red-900/50 dark:bg-red-950/10"
    >
      <div className="mb-2 flex items-center gap-2">
        <span aria-hidden="true" className="text-lg">
          🌀
        </span>
        <h3 id="typhoon-wind-map-heading" className="text-base font-bold text-slate-900 dark:text-slate-100">
          即時風場地圖
        </h3>
        <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800 dark:bg-red-950 dark:text-red-300">
          颱風警報生效中顯示
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
        <iframe
          src={WINDY_EMBED_URL}
          title="Windy 即時風場地圖（臺灣周邊）"
          loading="lazy"
          className="h-[420px] w-full border-0"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        風場圖像來自{" "}
        <a
          href={appendOutboundUtm("https://www.windy.com/", WINDY_ATTRIBUTION_UTM)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-indigo-600 dark:hover:text-indigo-400"
        >
          Windy.com
        </a>
        ，載入時會連線至該第三方網站；本站不判定颱風路徑預測，實際動態請以中央氣象署公告為準。
      </p>
    </section>
  );
}
