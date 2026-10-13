import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import AedContent from "@/components/Tools/AedContent";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";
import { isPathLocale, ogAlternateLocales, OG_LOCALE, type PathLocale } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #485 pilot page 3/3 — this file is intentionally a thin,
// locale-parameterized twin of app/(zh)/tools/aed/page.tsx: both call the
// exact same ToolPageShell + AedContent components (no forked copies), and
// both read government AED location data from the one facilities DB — see
// AedContent.tsx, which keeps institution names/addresses in Chinese and
// renders the Google Maps navigation button via getNavigationButtonLabel().

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/aed";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("aed", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: ["AED", "automated external defibrillator", "cardiac arrest", "CPR"],
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
    title: "Hands-On First Aid & Life-Saving Training",
    description:
      "Finding the nearest AED is only part of winning the golden window — Kuma Academy (黑熊學院) offers in-person training in modern trauma first aid, tourniquet use, and self/mutual rescue skills.",
  },
  ja: {
    title: "応急処置・止血・救命トレーニング",
    description:
      "AEDの位置を調べるだけでは黄金時間を活かせません。「黒熊学院（Kuma Academy）」では現代的な外傷応急処置、止血帯の使用法、自己・相互救助の実技訓練を受けられます。",
  },
  ko: {
    title: "응급처치·지혈 및 생명 구조 훈련",
    description:
      "가장 가까운 AED를 찾는 것만으로는 골든타임을 충분히 활용할 수 없습니다. 'Kuma Academy(흑곰학원)'에서 현대적 외상 응급처치, 지혈대 사용법, 자가·상호 구조 실습 교육을 받을 수 있습니다.",
  },
};

export default async function LocaleAedPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("aed", locale);
  const partnerText = PARTNER_CARD_TEXT[locale];

  return (
    <ToolPageShell slug="aed" title={meta.title} maxWidthClassName="max-w-4xl" locale={locale}>
      <ContextualPartnerCard
        partnerId="kuma"
        contextTitle={partnerText.title}
        contextDescription={partnerText.description}
      />
      <Suspense>
        <AedContent />
      </Suspense>
    </ToolPageShell>
  );
}
