import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import { getCurrentGdacsDisasterEvents } from "@/lib/server/gdacs/queries";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import GlobeWatchDisastersItem from "@/components/Tools/GlobeWatch/GlobeWatchDisastersItem";
import { isPathLocale, ogAlternateLocales, OG_LOCALE, type PathLocale } from "@/lib/i18n/dictionary";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #594 (parent #583): thin locale-parameterized twin of
// app/(zh)/tools/global-watch/disasters/page.tsx, same shape as
// app/[locale]/tools/global-watch/epidemics/page.tsx (#589). Registered in
// TRANSLATED_STANDALONE_PATHS (not TRANSLATED_TOOL_SLUGS — this is a nested
// sub-route, not a flat /tools/<slug> page), so ToolPageShell's
// isTranslatedToolSlug("global-watch") check stays false and its
// catalog-sourced FAQ/body sections render in Chinese here too — only this
// file's own `metadata`/body text and the shell's generic chrome are
// localized, same documented limitation as the epidemics locale page.
export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/global-watch/disasters";

type Params = Promise<{ locale: string }>;

const PAGE_META: Record<PathLocale, { title: string; description: string }> = {
  en: {
    title: "Global Disasters Map | GDACS Flood, Volcano, Drought, Wildfire - Global Watch",
    description:
      "Current GDACS (Global Disaster Alert and Coordination System) flood, volcano, drought, and wildfire events worldwide, colored by GDACS's red/orange/green alert level. Toggle which disaster types to show; country, type, and alert-level names are localized where a lookup entry exists. Titles and details stay in the original English with a link to the GDACS report.",
  },
  ja: {
    title: "世界の災害マップ｜GDACS 洪水・火山・干ばつ・森林火災 - グローバルウォッチ",
    description:
      "GDACS（災害警戒・協調システム）による世界の洪水・火山・干ばつ・森林火災の現在の事件を、GDACSの赤／オレンジ／緑の警戒レベルで色分け表示。表示する災害種別を選択できます。国名・災害種別・警戒レベルは対応表がある場合のみ翻訳され、ない場合は原文を表示します。タイトルと本文は英語原文のまま、GDACSレポートへのリンクを併記します。",
  },
  ko: {
    title: "전 세계 재해 지도 | GDACS 홍수・화산・가뭄・산불 - 글로벌 워치",
    description:
      "GDACS(전 세계 재해 경보 조정 시스템)의 현재 홍수・화산・가뭄・산불 사건을 GDACS의 빨강/주황/초록 경보 등급으로 색상 표시합니다. 표시할 재해 종류를 선택할 수 있습니다. 국가명・재해 종류・경보 등급은 대응표가 있는 경우에만 번역되며, 없으면 원문을 표시합니다. 제목과 본문은 영어 원문을 유지하며 GDACS 보고서 링크를 함께 제공합니다.",
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
    keywords: ["global disasters", "GDACS", "flood", "volcano", "drought", "wildfire", "global watch"],
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
  en: "Shows GDACS's current flood (FL), volcano (VO), drought (DR), and wildfire (WF) events worldwide — earthquakes and tropical cyclones have their own items. Events are colored by GDACS's red/orange/green alert level; use the checkboxes below to choose which disaster types to show. Country, disaster-type, and alert-level names are translated where a lookup entry exists, and shown as-is otherwise. Event titles and details stay in the original English, with a link to the GDACS report.",
  ja: "GDACSによる世界の洪水（FL）・火山（VO）・干ばつ（DR）・森林火災（WF）の現在の事件を表示します（地震・熱帯低気圧は別項目）。GDACSの赤／オレンジ／緑の警戒レベルで色分けし、下のチェックボックスで表示する災害種別を選択できます。国名・災害種別・警戒レベルは対応表がある場合のみ翻訳され、ない場合は原文のまま表示します。タイトルと本文は英語原文のまま、GDACSレポートへのリンクを併記します。",
  ko: "GDACS의 현재 홍수(FL)・화산(VO)・가뭄(DR)・산불(WF) 사건을 전 세계 기준으로 표시합니다（지진・열대성 저기압은 별도 항목). GDACS의 빨강/주황/초록 경보 등급으로 색상이 표시되며, 아래 체크박스로 표시할 재해 종류를 선택할 수 있습니다. 국가명・재해 종류・경보 등급은 대응표가 있는 경우에만 번역되고, 없으면 원문 그대로 표시됩니다. 제목과 본문은 영어 원문을 유지하며 GDACS 보고서 링크를 함께 제공합니다.",
};

export default async function LocaleGlobalWatchDisastersPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const catalogEntry = getToolCatalogEntry("global-watch");
  const meta = PAGE_META[locale];
  const rows = await getCurrentGdacsDisasterEvents();

  return (
    <ToolPageShell
      slug="global-watch"
      title={`${catalogEntry.title} | ${meta.title.split("|")[0].trim()}`}
      maxWidthClassName="max-w-5xl"
      locale={locale}
    >
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">{BODY_TEXT[locale]}</p>

      <GlobeWatchDisastersItem rows={rows} />
    </ToolPageShell>
  );
}
