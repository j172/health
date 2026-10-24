"use client";

import { usePathname } from "next/navigation";
import { useLanguage } from "@/app/context/LanguageContext";
import {
  useCbsAlertStatus,
  isCbsBannerExcludedPath,
  shouldShowCbsBanner,
} from "@/lib/client/cbsAlertStore";
import { buildLocalizedPath } from "@/lib/i18n/translatedPages";

/**
 * 全站重大緊急告警橫幅（CBS細胞廣播，issue #806）。
 *
 * 架構比照颱風警報橫幅（components/Typhoon/TyphoonBanner.tsx，#744）
 * 與地震速報橫幅（components/Earthquake/EarthquakeBanner.tsx）。
 *
 * 客戶端元件：SSR / hydration 時輸出 null，避免 Cloudflare 靜態快取住動態緊急狀態。
 * 載入後向 /api/cbs-status 取得狀態，當有生效中的國家級警報（Extreme / Severe）時顯示。
 * 沒有警報、尚未載入、fetch 失敗／逾時、後台頁面 → 輸出 null，不佔任何版面。
 */

const LOCALE_TAGS: Record<string, string> = {
  "zh-TW": "zh-TW",
  en: "en-US",
  ja: "ja-JP",
  ko: "ko-KR",
};

const formatExpiresAt = (iso: string | undefined, locale: string): string | null => {
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

export default function CbsEmergencyBanner() {
  const pathname = usePathname();
  const { t, locale, isLocaleLocked } = useLanguage();
  const status = useCbsAlertStatus(60_000);

  if (isCbsBannerExcludedPath(pathname) || !shouldShowCbsBanner(status)) {
    return null;
  }

  // Primary active alert (sorted with Extreme first)
  const alert = status!.activeAlerts[0];
  if (!alert) return null;

  const isExtreme = alert.severity === "Extreme";
  const mapHref = isLocaleLocked
    ? buildLocalizedPath("/tools/disaster-map", locale)
    : "/tools/disaster-map";

  const expiresAt = formatExpiresAt(alert.expires, locale);
  const isDebrisFlow =
    alert.event.includes("土石流") ||
    alert.headline.includes("土石流") ||
    alert.description.includes("土石流");

  // Styling adheres to #744 design language:
  // rounded-3xl, shadow-lg, bold typography, WCAG AA contrast (> 6:1)
  const tone = isExtreme
    ? "border-red-900 bg-red-700 text-white hover:bg-red-800"
    : "border-orange-600 bg-orange-500 text-slate-950 hover:bg-orange-400";

  const badgeTone = isExtreme ? "bg-white text-red-900" : "bg-slate-950 text-white";
  const btnClass = isExtreme
    ? "inline-flex items-center rounded-xl bg-white px-3.5 py-1.5 text-xs font-bold text-red-900 shadow hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-white"
    : "inline-flex items-center rounded-xl bg-slate-950 px-3.5 py-1.5 text-xs font-bold text-white shadow hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-950";

  const linkClass = isExtreme
    ? "font-semibold underline underline-offset-2 text-white decoration-white/70 hover:decoration-white"
    : "font-semibold underline underline-offset-2 text-slate-950 decoration-slate-950/70 hover:decoration-slate-950";

  return (
    <div
      role="alert"
      aria-label={t("cbs.banner.ariaLabel", "災防告警細胞廣播")}
      data-cbs-banner={alert.severity.toLowerCase()}
      className="mx-auto max-w-5xl px-4 pt-3 sm:px-6 sm:pt-4 lg:px-8"
    >
      <div
        className={`flex flex-col items-center gap-3 rounded-3xl border px-5 py-4 text-center text-sm shadow-lg transition-all motion-reduce:transition-none sm:scale-[1.02] sm:px-8 sm:py-5 ${tone}`}
      >
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-lg font-extrabold tracking-tight sm:text-xl">
          <span aria-hidden="true" className="text-3xl leading-none sm:text-4xl">
            {isExtreme ? "🚨" : "⚠️"}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${badgeTone}`}>
            {isExtreme
              ? t("cbs.banner.badgeExtreme", "國家級警報 (PWS)")
              : t("cbs.banner.badgeSevere", "緊急警戒")}
          </span>
          <span className="font-bold">{alert.event}</span>
          {expiresAt ? (
            <span className="text-xs font-normal opacity-90">
              {t("cbs.banner.expiresTemplate", "有效至 {time}").replace("{time}", expiresAt)}
            </span>
          ) : null}
        </div>

        <p className="max-w-3xl text-sm font-medium leading-relaxed sm:text-base">
          {alert.headline}
        </p>

        {alert.areas.length > 0 ? (
          <p className="text-xs font-semibold sm:text-sm">
            <span>示警區域：</span>
            <span>{alert.areas.join("、")}</span>
          </p>
        ) : null}

        <p className="text-xs opacity-90">
          {t("cbs.banner.officialNotice", "請即刻採取相應防護避難措施，詳情依主管機關公告為準。")}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          {isDebrisFlow ? (
            <a href={`${mapHref}?layer=debris`} className={btnClass}>
              {t("cbs.banner.debrisFlow", "土石流警戒溪流村里")}
            </a>
          ) : null}
          <a href={mapHref} className={btnClass}>
            {t("cbs.banner.disasterMap", "即時災害地圖")}
          </a>
          {alert.web ? (
            <a
              href={alert.web}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              官方通報連結
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
