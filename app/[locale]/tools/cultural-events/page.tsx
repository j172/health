import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import CulturalEventsContent from "@/components/Activities/CulturalEventsContent";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";
import { isPathLocale, ogAlternateLocales, OG_LOCALE, type PathLocale } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #487 — locale-aware twin of app/(zh)/tools/cultural-events/page.tsx.
// CulturalEventsContent itself (components/Activities/CulturalEventsContent.tsx)
// was converted to read every UI-chrome string through useLanguage()'s t()
// (culturalEventsTool.* dictionary keys) — the 文化部 event data it fetches
// (titles, venues, descriptions) stays Chinese verbatim, same as every other
// translated tool page's government/real-time data.

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/cultural-events";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("cultural-events", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: ["arts events", "exhibitions", "Ministry of Culture", "family activities", "concerts"],
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

const PARTNER_CARD_TEXT: Record<PathLocale, { title: string; description: string }> = {
  en: {
    title: "Open Civic Tech & Hackathons",
    description:
      "Beyond arts and public-health events, consider joining \"g0v Zero1\" — a bimonthly civic-tech hackathon, project meetup, and open-source workshop series that uses technology and citizen collaboration to drive change.",
  },
  ja: {
    title: "オープン市民テック・ハッカソン",
    description:
      "芸術・公衆衛生イベントのほか、「g0v 零時政府」が開催する隔月のハッカソン、プロジェクト交流会、オープンソースワークショップにもぜひご参加ください。テクノロジーと市民の協働で変化を生み出します。",
  },
  ko: {
    title: "오픈 시민 기술 및 해커톤",
    description:
      "예술 및 공익 행사 외에도 'g0v 제로 정부'가 주최하는 격월 해커톤, 프로젝트 모임, 오픈소스 워크숍에 참여해 보세요. 기술과 시민 협업으로 변화를 만들어 갑니다.",
  },
};

export default async function LocaleCulturalEventsPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("cultural-events", locale);
  const partnerText = PARTNER_CARD_TEXT[locale];

  return (
    <ToolPageShell slug="cultural-events" title={meta.title} maxWidthClassName="max-w-4xl" locale={locale}>
      <ContextualPartnerCard
        partnerId="g0v"
        contextTitle={partnerText.title}
        contextDescription={partnerText.description}
      />
      <CulturalEventsContent />
    </ToolPageShell>
  );
}
