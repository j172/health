import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  listActiveCwaAlerts,
  listTopRainfallStations,
} from "@/lib/server/cwa/queries";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import WeatherRainfallLocator from "@/components/Tools/WeatherRainfallLocator";
import WeatherAlertsList from "@/components/Tools/WeatherAlertsList";
import { isPathLocale, ogAlternateLocales, OG_LOCALE, getDictionary } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #486 (parent #438 §Q) — locale-parameterized twin of
// app/(zh)/tools/weather-alerts/page.tsx, following the issue #485 pattern
// (see app/[locale]/tools/er-status/page.tsx for the thin-wrapper shape).
// Unlike er-status, the zh page's own page.tsx carries substantial
// page-level static JSX itself (a header summary block, and the alerts
// section heading/count/all-clear state) rather than delegating all of it
// to a Content component, so this file re-renders that same structure with
// every static string routed through getDictionary(locale)'s `t()`. This
// page is an async Server Component, so useLanguage() (a Client Component
// hook) can't be used here — see lib/i18n/dictionary.ts's doc comment on
// this exact client/server split. Alert titles/descriptions/instructions
// (from CWA) and the rainfall station names/leaderboard are live
// government data and stay in Chinese verbatim, same as
// WeatherAlertsList.tsx / WeatherRainfallLocator.tsx.

export const revalidate = 300;
export const runtime = "nodejs";

// Issue #157 (kept in sync with the zh page.tsx's own comment): the alerts
// list paginates client-side (30/50/100 per page) over whatever this
// fetches, so the limit needs enough headroom to actually page through.
// Active alerts are naturally a small set (tens, not hundreds), so 100
// comfortably covers it without an unbounded query.
const WEATHER_ALERTS_FETCH_LIMIT = 100;

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/weather-alerts";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("weather-alerts", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    // One English keyword set shared across all 3 locales (same approach
    // as app/[locale]/tools/er-status/page.tsx), translated once from the
    // zh page's own keywords array rather than per-locale.
    keywords: [
      "weather alerts Taiwan",
      "heavy rain warning",
      "strong wind advisory",
      "typhoon warning",
      "tsunami warning",
      "rainfall station lookup",
      "cumulative rainfall",
      "CWA Taiwan",
    ],
    alternates: { canonical, languages },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: canonical,
      locale: OG_LOCALE[locale],
      alternateLocale: ogAlternateLocales(locale),
    },
  };
}

export default async function LocaleWeatherAlertsPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("weather-alerts", locale);
  const { t } = getDictionary(locale);

  const [alerts, topStations] = await Promise.all([
    listActiveCwaAlerts(WEATHER_ALERTS_FETCH_LIMIT),
    listTopRainfallStations(5),
  ]);

  return (
    <ToolPageShell slug="weather-alerts" title={meta.title} locale={locale} maxWidthClassName="max-w-5xl">
      <div className="space-y-10">
        {/* Header summary */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-3 w-3 rounded-full bg-indigo-600 dark:bg-indigo-400" />
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
              {t("weatherAlertsTool.pageHeading", "全台即時氣象警報與降雨監測")}
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {t("weatherAlertsTool.cwaLiveBadge", "中央氣象署 CWA 即時連線")}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm dark:text-slate-400">
            {t(
              "weatherAlertsTool.pageDescription",
              "整合陸上強風特報 (W-C0033-003)、濃霧特報 (W-C0033-004)、豪大雨特報 (W-C0033-005)、颱風警報與路徑 (W-C0034-001/005)、海嘯資訊及全台各鄉鎮劇烈天氣特報。",
            )}
          </p>
        </div>

        {/* 1. Rainfall Locator Module */}
        <section
          aria-labelledby="rainfall-locator-heading"
          className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-950/40"
        >
          <WeatherRainfallLocator initialTopStations={topStations} />
        </section>

        {/* 2. Active Weather Alerts Section */}
        <section aria-labelledby="alerts-list-heading" className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <h3
                id="alerts-list-heading"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                {t("weatherAlertsTool.activeAlertsHeading", "⚠️ 生效中氣象特報與災害預警")}
              </h3>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                {t("weatherAlertsTool.alertsCountBadgeTemplate", "共 {value} 則特報").replace(
                  "{value}",
                  String(alerts.length),
                )}
              </span>
            </div>
            <span className="text-xs text-slate-600">
              {t("weatherAlertsTool.updateFrequencyLabel", "更新頻率：每 5-10 分鐘")}
            </span>
          </div>

          {alerts.length > 0 ? (
            <WeatherAlertsList alerts={alerts} />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50/60 p-8 text-center dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <span className="text-4xl">🟢</span>
              <h4 className="mt-2 text-base font-bold text-emerald-900 dark:text-emerald-200">
                {t("weatherAlertsTool.allClearHeading", "全台天氣概況良好")}
              </h4>
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                {t("weatherAlertsTool.allClearDescription", "中央氣象署目前未發布任何豪大雨、強風、濃霧或颱風警報。")}
              </p>
            </div>
          )}
        </section>
      </div>
    </ToolPageShell>
  );
}
