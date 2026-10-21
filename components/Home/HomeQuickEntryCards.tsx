"use client";

import Link from "next/link";
import { useLanguage } from "@/app/context/LanguageContext";
import { useTyphoonStatus } from "@/lib/client/typhoonStatusStore";
import { shouldShowTyphoonBanner } from "@/lib/typhoon/typhoonStatus";
import { buildLocalizedPath } from "@/lib/i18n/translatedPages";

/**
 * 首頁常駐兩張大卡片（issue #744）：「颱風與警報」→ /tools/weather-alerts、
 * 「明天放假嗎？」→ /tools/work-school-status，固定放在天氣狀態列之上。
 *
 * 警報狀態走客戶端（與全站橫幅共用同一次 /api/typhoon-status 請求）：伺服器渲染的 HTML
 * 永遠是平時樣式，不依賴警報，所以 60 秒 ISR／Cloudflare 快取不會被污染；載入後若颱風警報
 * 生效，兩張卡片變色（陸上紅、海上橙）並放大。fetch 失敗或沒有警報 → 維持平時樣式。
 * 級別不只靠顏色：卡片內文字寫明「陸上警報／海上警報」。
 *
 * 文案不轉述各縣市是否放假：「明天放假嗎？」卡片只導向「今天／明天要上班上課嗎」工具，
 * 警報中只提示「請查官方停班停課公告」。
 */

type CardTone = "normal" | "land" | "sea";

const CARD_TONE_CLASSES: Record<CardTone, { box: string; title: string; desc: string; cta: string }> = {
  normal: {
    box: "border-slate-200 bg-white p-5 hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700",
    title: "text-lg text-slate-900 dark:text-slate-100",
    desc: "text-sm text-slate-600 dark:text-slate-400",
    cta: "text-indigo-600 dark:text-indigo-400",
  },
  land: {
    box: "border-red-900 bg-red-700 p-6 shadow-lg hover:bg-red-800 sm:scale-[1.03]",
    title: "text-xl text-white",
    desc: "text-sm text-red-50",
    cta: "text-white",
  },
  sea: {
    box: "border-orange-500 bg-orange-400 p-6 shadow-lg hover:bg-orange-300 sm:scale-[1.03]",
    title: "text-xl text-slate-900",
    desc: "text-sm text-slate-900",
    cta: "text-slate-900",
  },
};

function QuickEntryCard({
  href,
  emoji,
  title,
  description,
  badge,
  cta,
  tone,
}: {
  href: string;
  emoji: string;
  title: string;
  description: string;
  badge: string | null;
  cta: string;
  tone: CardTone;
}) {
  const classes = CARD_TONE_CLASSES[tone];
  return (
    <Link
      href={href}
      data-typhoon-card={tone}
      className={`flex min-h-[7.5rem] flex-col justify-between gap-3 rounded-3xl border transition-all motion-reduce:transition-none ${classes.box}`}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-3xl leading-none sm:text-4xl">{emoji}</span>
        <div className="min-w-0">
          <p className={`flex flex-wrap items-center gap-2 font-extrabold tracking-tight ${classes.title}`}>
            {title}
            {badge ? (
              <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${tone === "land" ? "bg-white text-red-800" : "bg-slate-900 text-orange-100"}`}>
                {badge}
              </span>
            ) : null}
          </p>
          <p className={`mt-1 leading-relaxed ${classes.desc}`}>{description}</p>
        </div>
      </div>
      <p className={`text-sm font-bold ${classes.cta}`}>{cta} →</p>
    </Link>
  );
}

export default function HomeQuickEntryCards() {
  const { t, locale, isLocaleLocked } = useLanguage();
  const status = useTyphoonStatus();
  const tone: CardTone = shouldShowTyphoonBanner(status) ? status.level : "normal";
  const active = tone !== "normal";

  const localize = (path: string) => (isLocaleLocked ? buildLocalizedPath(path, locale) : path);
  const badge = tone === "land" ? t("typhoon.banner.landBadge", "陸上警報") : tone === "sea" ? t("typhoon.banner.seaBadge", "海上警報") : null;
  const cta = t("typhoon.cards.cta", "立即查看");

  return (
    <section aria-label={t("typhoon.cards.sectionAriaLabel", "颱風與警報、放假資訊入口")} className="mb-6">
      <div className={`grid gap-3 sm:grid-cols-2 ${active ? "sm:gap-5" : ""}`}>
        <QuickEntryCard
          href={localize("/tools/weather-alerts")}
          emoji={active ? "🌀" : "⚠️"}
          title={t("typhoon.cards.alertsTitle", "颱風與警報")}
          description={
            active
              ? t("typhoon.cards.alertsActiveDesc", "颱風警報生效中・查看最新警報")
              : t("typhoon.cards.alertsDesc", "颱風、豪雨、地震、強風等即時警報")
          }
          badge={badge}
          cta={cta}
          tone={tone}
        />
        <QuickEntryCard
          href={localize("/tools/work-school-status")}
          emoji="🗓️"
          title={t("typhoon.cards.holidayTitle", "明天放假嗎？")}
          description={
            active
              ? t("typhoon.cards.holidayActiveDesc", "颱風警報中・請查官方停班停課公告")
              : t("typhoon.cards.holidayDesc", "查今天／明天要不要上班上課，附官方停班停課公告連結")
          }
          badge={null}
          cta={cta}
          tone={tone}
        />
      </div>
    </section>
  );
}
