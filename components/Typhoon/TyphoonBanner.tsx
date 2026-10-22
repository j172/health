"use client";

import { usePathname } from "next/navigation";
import { useLanguage } from "@/app/context/LanguageContext";
import { useTyphoonStatus } from "@/lib/client/typhoonStatusStore";
import { isTyphoonBannerExcludedPath, shouldShowTyphoonBanner } from "@/lib/typhoon/typhoonStatus";
import { buildLocalizedPath } from "@/lib/i18n/translatedPages";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import { CLOSURE_OFFICIAL_LINKS, DGPA_CLOSURE_PAGE_URL } from "@/lib/tools/workSchoolStatus/closureGuidance";

/**
 * 全站颱風警報橫幅（issue #744）。
 *
 * 一定要是客戶端元件：新聞單篇頁等多數頁面由 Cloudflare 快取 60 秒並在伺服器渲染，
 * 橫幅若寫進頁面 HTML 會被快取卡住或顯示錯誤。這裡 SSR／hydration 時 `useTyphoonStatus()`
 * 一律是 null → 輸出 null；載入後向 /api/typhoon-status 取得狀態，確定生效才渲染。
 * 沒有警報、尚未載入、fetch 失敗／逾時、後台頁面 → 都是 null，不佔任何版面。
 *
 * 本站不轉述各縣市是否停班停課：橫幅只說「颱風警報生效中，明天是否停班停課請以官方公告為準」，
 * 並提供官方公告、各縣市洽詢電話、天氣警報工具三個連結。
 *
 * 級別不只靠顏色：標題與徽章文字都寫「陸上警報／海上警報」。
 * 陸上：紅底白字（對比 > 6）；海上：橙底深色字（對比 > 8）。
 *
 * 視覺樣式（#744 restyle）：套用首頁常駐大卡片（components/Home/HomeQuickEntryCards.tsx）
 * 的視覺語言——大圓角 rounded-3xl、陰影、大 emoji、大標題字級、生效中放大效果——但維持
 * 「單條橫向橫幅」的版面，不拆成並排卡片；卡片本身維持原狀不受影響。
 */

const CONTACTS_URL = CLOSURE_OFFICIAL_LINKS.find((link) => link.id === "contacts")?.url ?? DGPA_CLOSURE_PAGE_URL;

const UTM = { medium: "typhoon_banner", campaign: "typhoon_warning" } as const;

const LOCALE_TAGS: Record<string, string> = { "zh-TW": "zh-TW", en: "en-US", ja: "ja-JP", ko: "ko-KR" };

const formatIssuedAt = (iso: string | undefined, locale: string): string | null => {
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

export default function TyphoonBanner() {
  const pathname = usePathname();
  const { t, locale, isLocaleLocked } = useLanguage();
  const status = useTyphoonStatus(5 * 60_000);

  if (isTyphoonBannerExcludedPath(pathname) || !shouldShowTyphoonBanner(status)) return null;

  const isLand = status.level === "land";
  const toolHref = isLocaleLocked ? buildLocalizedPath("/tools/weather-alerts", locale) : "/tools/weather-alerts";
  const issuedAt = formatIssuedAt(status.issuedAt, locale);

  // 大卡片視覺語言（與 HomeQuickEntryCards 的 CARD_TONE_CLASSES 同一組紅／橙配色），
  // 套在單條橫幅的圓角卡殼上：rounded-3xl、陰影、生效中略微放大。
  const tone = isLand
    ? "border-red-900 bg-red-700 text-white hover:bg-red-800"
    : "border-orange-500 bg-orange-400 text-slate-900 hover:bg-orange-300";
  const badgeTone = isLand ? "bg-white text-red-800" : "bg-slate-900 text-orange-100";
  const linkTone = isLand ? "text-white decoration-white/70 hover:decoration-white" : "text-slate-900 decoration-slate-900/60 hover:decoration-slate-900";

  const linkClass = `font-semibold underline underline-offset-2 ${linkTone}`;

  return (
    <div
      role={isLand ? "alert" : "status"}
      aria-label={t("typhoon.banner.ariaLabel", "颱風警報")}
      data-typhoon-banner={status.level}
      className="mx-auto max-w-5xl px-4 pt-3 sm:px-6 sm:pt-4 lg:px-8"
    >
      <div
        className={`flex flex-col items-center gap-2 rounded-3xl border px-5 py-4 text-center text-sm shadow-lg transition-all motion-reduce:transition-none sm:scale-[1.02] sm:px-8 sm:py-5 ${tone}`}
      >
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-lg font-extrabold tracking-tight sm:text-xl">
          <span aria-hidden="true" className="text-3xl leading-none sm:text-4xl">
            {isLand ? "🌀" : "🌊"}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${badgeTone}`}>
            {isLand ? t("typhoon.banner.landBadge", "陸上警報") : t("typhoon.banner.seaBadge", "海上警報")}
          </span>
          <span>{isLand ? t("typhoon.banner.landTitle", "颱風陸上警報生效中") : t("typhoon.banner.seaTitle", "颱風海上警報")}</span>
          {status.names?.length ? (
            <span data-typhoon-names className="text-base font-bold sm:text-lg">{status.names.join("、")}</span>
          ) : null}
          {issuedAt ? (
            <span className="text-xs font-normal opacity-90">
              {t("typhoon.banner.issuedAtTemplate", "發布 {time}").replace("{time}", issuedAt)}
            </span>
          ) : null}
          {status.simulated ? (
            <span className="rounded border border-current px-1.5 py-0.5 text-xs font-bold">
              {t("typhoon.banner.simulated", "測試模擬")}
            </span>
          ) : null}
        </p>
        <p className="text-xs leading-relaxed sm:text-sm">
          {t("typhoon.banner.notice", "明天是否停班停課請以官方公告為準。本站不判定各縣市是否停班停課。")}
        </p>
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs sm:text-sm">
          <li>
            <a href={appendOutboundUtm(DGPA_CLOSURE_PAGE_URL, UTM)} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {t("typhoon.banner.linkOfficial", "行政院人事行政總處停班停課公告")}
            </a>
          </li>
          <li>
            <a href={appendOutboundUtm(CONTACTS_URL, UTM)} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {t("typhoon.banner.linkContacts", "各縣市洽詢電話")}
            </a>
          </li>
          <li>
            <a href={toolHref} className={linkClass}>
              {t("typhoon.banner.linkTool", "天氣警報工具")}
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
