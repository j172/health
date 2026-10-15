import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import { env } from "@/lib/server/config/env";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import GlobeWatchItemTabs from "@/components/Tools/GlobeWatch/GlobeWatchItemTabs";
import GlobeWatchAirQualityClient from "@/components/Tools/GlobeWatch/GlobeWatchAirQualityClient";
import { WAQI_ATTRIBUTION_HTML } from "@/lib/tools/globeWatch/airQualityTiles";
import { isPathLocale, ogAlternateLocales, OG_LOCALE, type PathLocale } from "@/lib/i18n/dictionary";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #598 (parent #583, phase 4): thin locale-parameterized twin of
// app/(zh)/tools/global-watch/air-quality/page.tsx, same shape as
// app/[locale]/tools/global-watch/epidemics/page.tsx. The 全球空品 item is
// registered in `TRANSLATED_STANDALONE_PATHS` (see
// lib/i18n/translatedPages.ts), not `TRANSLATED_TOOL_SLUGS` — same reasoning
// as the earthquakes/epidemics items' own page.tsx doc comments: this is a
// nested `/tools/global-watch/air-quality` sub-route, not a flat
// `/tools/<slug>` catalog page.
//
// Because "global-watch" itself isn't a TRANSLATED_TOOL_SLUGS entry,
// ToolPageShell's catalog-sourced FAQ/directAnswer/scientificBasis sections
// render in Chinese on this page too — only this file's own
// `metadata`/visible body content and the shell's generic chrome are
// actually localized (same known limitation the epidemics locale page's
// comment documents).
export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/global-watch/air-quality";

type Params = Promise<{ locale: string }>;

const PAGE_META: Record<PathLocale, { title: string; description: string }> = {
  en: {
    title: "Global Air Quality Map | WAQI Real-Time AQI Tiles - Global Watch",
    description:
      "Real-time global AQI color tiles from the World Air Quality Index Project (WAQI), overlaid directly on the 3D globe — check your destination's air quality before you travel. Includes an AQI color-scale legend and a one-click link to this site's Taiwan-specific Air Quality tool.",
  },
  ja: {
    title: "世界の大気質マップ｜WAQIリアルタイムAQIタイル - グローバルウォッチ",
    description:
      "World Air Quality Index Project（WAQI）のリアルタイム世界AQIタイルを3D地球に直接重ねて表示。渡航前に目的地の大気質を一目で確認できます。AQIカラースケールの凡例と、台湾国内の「空気質指数」ツールへのリンクも用意しています。",
  },
  ko: {
    title: "글로벌 대기질 지도 | WAQI 실시간 AQI 타일 - 글로벌 워치",
    description:
      "World Air Quality Index Project(WAQI)의 실시간 전 세계 AQI 색상 타일을 3D 지구본에 직접 겹쳐 표시합니다. 여행 전 목적지의 대기질을 한눈에 확인하세요. AQI 색상 등급 범례와 대만 현지 '공기질 지수' 도구로 바로 이동하는 링크도 제공합니다.",
  },
};

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = PAGE_META[locale];
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: ["global air quality", "AQI map", "WAQI", "air pollution map", "global watch"],
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

const BODY_TEXT: Record<PathLocale, string> = {
  en: "Overlays the World Air Quality Index Project's (WAQI) real-time global AQI color tiles directly on the globe, colored by the US EPA AQI scale. Tiles are requested by your browser directly from WAQI's servers — never through this site's backend, and nothing is stored in this site's database. Figures are for reference only; for authoritative station-level detail, check WAQI or your destination's official monitoring agency. Looking for Taiwan's own station-level data? Use the link below.",
  ja: "World Air Quality Index Project（WAQI）が提供するリアルタイムの世界AQIタイルを地球に直接重ねて表示します。色は米国EPAのAQI基準に基づきます。タイルはブラウザがWAQIのサーバーへ直接リクエストし、本サイトのサーバーを経由せず、データベースにも保存されません。数値は参考情報であり、正式な測定局データはWAQIまたは各国の公式機関の発表をご確認ください。台湾国内の測站データをお探しの場合は、下のリンクをご利用ください。",
  ko: "World Air Quality Index Project(WAQI)가 제공하는 실시간 전 세계 AQI 타일을 지구본에 직접 겹쳐 표시합니다. 색상은 미국 EPA의 AQI 등급을 기준으로 합니다. 타일은 브라우저가 WAQI 서버에 직접 요청하며, 본 사이트의 서버를 거치지 않고 데이터베이스에도 저장되지 않습니다. 수치는 참고용이며, 공식 측정소 데이터는 WAQI 또는 목적지의 공식 기관 발표를 확인하세요. 대만 현지 측정소 데이터가 필요하면 아래 링크를 이용하세요.",
};

const AQI_LINK_TEXT: Record<PathLocale, string> = {
  en: "View Taiwan station-level detail on the Air Quality tool →",
  ja: "台湾の測站詳細データは「空気質指数」ツールへ →",
  ko: "대만 측정소 상세 데이터는 '공기질 지수' 도구에서 확인 →",
};

const AQI_LINK_INTRO: Record<PathLocale, string> = {
  en: "Looking for Taiwan's real-time PM2.5/PM10 station data?",
  ja: "台湾各測站のPM2.5・PM10などの詳細データをお探しですか？",
  ko: "대만 각 측정소의 PM2.5·PM10 등 상세 데이터를 찾으시나요?",
};

export default async function LocaleGlobalWatchAirQualityPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const catalogEntry = getToolCatalogEntry("global-watch");
  const meta = PAGE_META[locale];

  return (
    <ToolPageShell
      slug="global-watch"
      title={`${catalogEntry.title} | ${meta.title.split("|")[0].trim()}`}
      maxWidthClassName="max-w-5xl"
      locale={locale}
    >
      <GlobeWatchItemTabs />

      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">{BODY_TEXT[locale]}</p>

      <GlobeWatchAirQualityClient waqiToken={env.waqiToken} />

      <p
        className="mt-3 text-xs text-slate-400 dark:text-slate-500"
        dangerouslySetInnerHTML={{ __html: WAQI_ATTRIBUTION_HTML }}
      />

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-slate-700 dark:text-slate-300">{AQI_LINK_INTRO[locale]}</p>
        <Link
          href={buildLocalizedPath("/tools/aqi", locale)}
          className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          {AQI_LINK_TEXT[locale]}
        </Link>
      </div>
    </ToolPageShell>
  );
}
