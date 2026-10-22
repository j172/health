"use client";

import { usePathname } from "next/navigation";
import { useLanguage } from "@/app/context/LanguageContext";
import { useEarthquakeStatus } from "@/lib/client/earthquakeStatusStore";
import { isEarthquakeBannerExcludedPath, shouldShowEarthquakeBanner } from "@/lib/earthquake/earthquakeStatus";
import { buildLocalizedPath } from "@/lib/i18n/translatedPages";

/**
 * 全站地震速報橫幅。架構完全比照颱風警報橫幅（components/Typhoon/TyphoonBanner.tsx，
 * issue #744），但觸發條件與顯示規則是地震專屬的（見 lib/earthquake/earthquakeStatus.ts）：
 * CWA 有感地震報告發生後固定顯示 72 小時，不是「警報生效中才顯示」。
 *
 * 一定要是客戶端元件：新聞單篇頁等多數頁面由 Cloudflare 快取 60 秒並在伺服器渲染，橫幅若寫進
 * 頁面 HTML 會被快取卡住或顯示過期／錯誤的地震資訊。這裡 SSR／hydration 時
 * `useEarthquakeStatus()` 一律是 null → 輸出 null；載入後向 /api/earthquake-status 取得狀態，
 * 確定有一筆有感地震落在 72 小時視窗內才渲染。沒有地震、尚未載入、fetch 失敗／逾時、後台頁面
 * → 都是 null，不佔任何版面。
 *
 * 顏色刻意與颱風橫幅（紅／橙）不同：琥珀色，避免與颱風的陸上／海上警報混淆。
 */

const LOCALE_TAGS: Record<string, string> = { "zh-TW": "zh-TW", en: "en-US", ja: "ja-JP", ko: "ko-KR" };

const formatOriginTime = (iso: string | undefined, locale: string): string | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    return new Intl.DateTimeFormat(LOCALE_TAGS[locale] ?? "zh-TW", {
      timeZone: "Asia/Taipei",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(ms));
  } catch {
    return null;
  }
};

export default function EarthquakeBanner() {
  const pathname = usePathname();
  const { t, locale, isLocaleLocked } = useLanguage();
  const status = useEarthquakeStatus(5 * 60_000);

  if (isEarthquakeBannerExcludedPath(pathname) || !shouldShowEarthquakeBanner(status)) return null;

  const toolHref = isLocaleLocked
    ? buildLocalizedPath("/tools/global-watch/earthquakes", locale)
    : "/tools/global-watch/earthquakes";
  const originTime = formatOriginTime(status.originTime, locale);

  const tone = "border-amber-800 bg-amber-600 text-white";
  const badgeTone = "bg-white text-amber-800";
  const linkClass = "font-semibold underline underline-offset-2 text-white decoration-white/70 hover:decoration-white";

  return (
    <div
      role="status"
      aria-label={t("earthquake.banner.ariaLabel", "地震速報")}
      data-earthquake-banner="active"
      className={`w-full border-b px-4 py-2.5 text-sm ${tone}`}
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-1.5 text-center sm:px-2">
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-bold">
          <span aria-hidden="true">🫨</span>
          <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${badgeTone}`}>
            {t("earthquake.banner.badge", "地震速報")}
          </span>
          <span>{t("earthquake.banner.title", "有感地震")}</span>
          {typeof status.magnitude === "number" ? (
            <span data-earthquake-magnitude>
              {t("earthquake.banner.magnitudeTemplate", "規模 M{magnitude}").replace("{magnitude}", status.magnitude.toFixed(1))}
            </span>
          ) : null}
          {status.maxIntensity ? (
            <span data-earthquake-intensity>
              {t("earthquake.banner.intensityTemplate", "最大震度 {intensity}").replace("{intensity}", status.maxIntensity)}
            </span>
          ) : null}
          {status.location ? <span data-earthquake-location>{status.location}</span> : null}
          {originTime ? (
            <span className="text-xs font-normal opacity-90">
              {t("earthquake.banner.originTimeTemplate", "發生於 {time}").replace("{time}", originTime)}
            </span>
          ) : null}
        </p>
        <p className="text-xs leading-relaxed sm:text-sm">
          {t("earthquake.banner.notice", "震度分布與後續地震資訊，請以中央氣象署公告為準。")}
        </p>
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs sm:text-sm">
          <li>
            <a href={toolHref} className={linkClass}>
              {t("earthquake.banner.linkTool", "地震速報工具")}
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
