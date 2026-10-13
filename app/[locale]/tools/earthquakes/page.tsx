import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTieredEarthquakes } from "@/lib/server/earthquakes/queries";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import EarthquakeContent from "@/app/(zh)/tools/earthquakes/EarthquakeContent";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";
import { isPathLocale, ogAlternateLocales, OG_LOCALE, type PathLocale } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #486 batch — thin locale-parameterized twin of
// app/(zh)/tools/earthquakes/page.tsx: same ToolPageShell + EarthquakeContent
// (colocated component, imported directly — not duplicated) and the same
// getTieredEarthquakes(168, 100) server fetch. Epicenter place names and raw
// magnitude/depth numbers stay as the live CWA/USGS data (see
// EarthquakeContent.tsx); only surrounding UI labels are localized.

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/earthquakes";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("earthquakes", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: ["earthquake", "Taiwan earthquake", "significant earthquake", "tsunami warning", "USGS", "CWA"],
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
    title: "Disaster Response & Self-Protection Basics",
    description:
      "A strong earthquake can't be predicted — knowing the first-moment response matters: Kuma Academy (黑熊學院) teaches earthquake-shelter techniques, furniture-anchoring protection, and post-disaster survival guidance.",
  },
  ja: {
    title: "地震災害対応と自己防護の基本",
    description:
      "強い地震の発生は予測できません。初動対応を身につけておきましょう。「黒熊学院（Kuma Academy）」では地震時の避難要領、家具の固定防護、災害後の生存ガイドを学べます。",
  },
  ko: {
    title: "지진 재해 대응과 자기 보호 기본",
    description:
      "강진 발생은 예측할 수 없습니다. 초기 대응 원칙을 익혀두세요. 'Kuma Academy(흑곰학원)'에서 지진 대피 요령, 가구 고정 보호, 재난 후 생존 가이드를 배울 수 있습니다.",
  },
};

export default async function LocaleEarthquakesPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("earthquakes", locale);
  const partnerText = PARTNER_CARD_TEXT[locale];
  const earthquakes = await getTieredEarthquakes(168, 100);

  return (
    <ToolPageShell slug="earthquakes" title={meta.title} maxWidthClassName="max-w-5xl" locale={locale}>
      <ContextualPartnerCard
        partnerId="kuma"
        contextTitle={partnerText.title}
        contextDescription={partnerText.description}
      />
      <EarthquakeContent earthquakes={earthquakes} />
    </ToolPageShell>
  );
}
