import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import DisasterMapContent from "@/components/DisasterMap/DisasterMapContent";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";
import { isPathLocale, ogAlternateLocales, OG_LOCALE, type PathLocale } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #486 — path-prefixed /en//ja//ko/ twin of app/(zh)/tools/disaster-map/page.tsx,
// following the exact pattern app/[locale]/tools/aed/page.tsx established for
// issue #485's pilot pages: a thin, locale-parameterized wrapper around the
// SAME ToolPageShell + DisasterMapContent components (no forked copies).
// DisasterMapContent keeps shelter/fire-rescue-unit/emergency-operations-center
// names and addresses in Chinese (government open data) and renders the
// Google Maps navigation button via getNavigationButtonLabel().

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/disaster-map";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("disaster-map", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: [
      "disaster map",
      "evacuation shelter",
      "fire rescue unit",
      "emergency operations center",
      "Ministry of the Interior",
      "disaster preparedness",
      "shelter map",
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

const PARTNER_CARD_TEXT: Record<PathLocale, { title: string; description: string }> = {
  en: {
    title: "Total Defense Evacuation & Civil Defense Preparedness",
    description:
      "Disaster preparedness isn't just about finding a shelter — visit Kuma Academy (黑熊學院) in peacetime to learn self-reliant evacuation-kit preparation, wartime civil-defense response, and basic first-aid skills, strengthening your household's defense resilience.",
  },
  ja: {
    title: "国民防衛避難・民間防衛への備え",
    description:
      "防災避難は収容避難所を探すだけではありません。平時から「黒熊学院（Kuma Academy）」で自主避難バッグの準備、戦時の民間防衛対応、基礎的な応急処置技能を身につけ、家庭の防衛レジリエンスを強化しましょう。",
  },
  ko: {
    title: "전 국민 방위 대피 및 민방위 대비",
    description:
      "재난 대비는 수용 대피소를 찾는 것만이 아닙니다. 평소에 'Kuma Academy(흑곰학원)'를 방문해 자율 대피 배낭 준비, 전시 민방위 대응, 기초 응급처치 기술을 익혀 가정의 방위 회복력을 강화하세요.",
  },
};

export default async function LocaleDisasterMapPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("disaster-map", locale);
  const partnerText = PARTNER_CARD_TEXT[locale];

  return (
    <ToolPageShell slug="disaster-map" title={meta.title} maxWidthClassName="max-w-5xl" locale={locale}>
      <ContextualPartnerCard
        partnerId="kuma"
        contextTitle={partnerText.title}
        contextDescription={partnerText.description}
      />
      <DisasterMapContent />
    </ToolPageShell>
  );
}
