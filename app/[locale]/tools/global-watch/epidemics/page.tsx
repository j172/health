import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import GlobeWatchItemNav from "@/components/Tools/GlobeWatch/GlobeWatchItemNav";
import GlobeWatchEpidemicsClient from "@/components/Tools/GlobeWatch/GlobeWatchEpidemicsClient";
import TravelEpidemicAlertsContent from "@/components/Epidemic/TravelEpidemicAlertsContent";
import { isPathLocale, ogAlternateLocales, OG_LOCALE, type PathLocale } from "@/lib/i18n/dictionary";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #589 (parent #583): thin locale-parameterized twin of
// app/(zh)/tools/global-watch/epidemics/page.tsx, same shape as
// app/[locale]/tools/earthquakes/page.tsx. The 國際疫情 item is NOT a
// TRANSLATED_TOOL_SLUGS entry (that registry only covers flat
// `/tools/<slug>` pages; this is a nested `/tools/global-watch/epidemics`
// sub-route) — it's registered instead in `TRANSLATED_STANDALONE_PATHS`
// (see lib/i18n/translatedPages.ts), which is what makes
// buildLocalizedPath/buildHreflangAlternates/isTranslatedPath work for it.
//
// Because of that, ToolPageShell's own `isTranslatedToolSlug("global-watch")`
// check is false, so its catalog-sourced FAQ/directAnswer/scientificBasis
// sections render in Chinese on this page too — only this file's own
// `metadata`/visible body content (below) and the shell's generic chrome
// (header/footer/breadcrumb labels, via the `locale` prop) are actually
// localized. Fully localizing the shell's catalog body would mean adding
// "global-watch" to TRANSLATED_TOOL_SLUGS, which requires a translated
// root-shell page too — out of scope for this ticket; see the PR
// description's "known limitation" note.
export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/global-watch/epidemics";

type Params = Promise<{ locale: string }>;

const PAGE_META: Record<PathLocale, { title: string; description: string }> = {
  en: {
    title: "Epidemics Map | Taiwan CDC Travel Health Notices - Global Watch",
    description:
      "Countries colored by Taiwan CDC's travel epidemic notice level (Watch/Alert/Warning). Click a country for every disease, level, advice, and CDC link; search, paginate, and read the latest intl. epidemic news.",
  },
  ja: {
    title: "国際感染症マップ｜台湾CDC海外感染症情報 - グローバルウォッチ",
    description:
      "台湾CDCの海外感染症情報レベル（注意／警示／警告）で国を色分け。国をクリックすると疾病・レベル・注意事項・CDCリンクを表示。疾病検索、ページネーション、最新の国際感染症ニュースも利用可能。",
  },
  ko: {
    title: "국제 감염병 지도 | 대만 질병관리청 해외여행 감염병 등급 - 글로벌 워치",
    description:
      "대만 질병관리청(CDC)의 해외여행 감염병 권고 등급(주의/경계/경고)에 따라 국가별로 색을 표시합니다. 국가를 클릭하면 질병·등급·권고사항·CDC 링크를 확인할 수 있고, 질병 검색/페이지네이션/국제 감염병 속보도 그대로 이용할 수 있습니다.",
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
    keywords: ["epidemic", "travel health notice", "CDC Taiwan", "dengue fever", "travel alert"],
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
  en: "Countries are colored by the highest Taiwan CDC travel epidemic notice level among their diseases: 🟡 Watch, 🟠 Alert, 🔴 Warning. Click a country on the globe to see every disease, level, advice, and CDC link for it. The disease search, pagination, and international epidemic news feed below (including dengue-fever coverage) carry the original Chinese-language source content, unchanged.",
  ja: "台湾CDCの海外感染症情報レベルのうち最も高いものを基準に国を色分けしています：🟡 注意、🟠 警示、🔴 警告。地球上の国をクリックすると、その国の疾病・レベル・注意事項・CDCリンクをすべて確認できます。下部の疾病検索・ページネーション・国際感染症ニュース（デング熱を含む）は、原文（中国語）のまま表示されます。",
  ko: "각 국가는 보유한 질병 중 가장 높은 대만 질병관리청(CDC) 해외여행 감염병 등급으로 색이 표시됩니다: 🟡 주의, 🟠 경계, 🔴 경고. 지구본에서 국가를 클릭하면 해당 국가의 모든 질병·등급·권고사항·CDC 링크를 볼 수 있습니다. 하단의 질병 검색, 페이지네이션, 국제 감염병 속보(뎅기열 포함)는 원문(중국어)을 그대로 제공합니다.",
};

export default async function LocaleGlobalWatchEpidemicsPage({ params }: { params: Params }) {
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
      <GlobeWatchItemNav locale={locale} />

      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">{BODY_TEXT[locale]}</p>

      <GlobeWatchEpidemicsClient />

      <div className="mt-8">
        <TravelEpidemicAlertsContent />
      </div>
    </ToolPageShell>
  );
}
