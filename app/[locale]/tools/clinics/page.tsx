import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";
import { facilitySearchConfigs } from "@/app/(zh)/tools/facilityConfigs";
import { isPathLocale, ogAlternateLocales, OG_LOCALE, type PathLocale } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #486 (parent #438 §Q) — thin locale-parameterized twin of
// app/(zh)/tools/clinics/page.tsx: same ToolPageShell + FacilitySearchContent
// components, same facilitySearchConfigs.clinics config and the one
// /api/facilities-backed data source. FacilitySearchContent now takes a
// `slug="clinics"` prop (issue #486) that looks up its own small set of
// config-authored UI strings under the `clinicsTool.*` dictionary namespace
// — government facility names/addresses stay in Chinese verbatim, same rule
// as the issue #485 pilot pages.

export const revalidate = 300;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/clinics";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("clinics", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: ["NHI-contracted medical facilities", "Taiwan hospital search", "clinic directory Taiwan"],
    alternates: { canonical, languages },
    // Matches app/(zh)/tools/clinics/page.tsx's own metadata.
    robots: { index: false },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: canonical,
      locale: OG_LOCALE[locale],
      alternateLocale: ogAlternateLocales(locale),
    },
  };
}

const PARTNER_CARD_TEXT: Record<PathLocale, { title: string; description: string; actionText: string }> = {
  en: {
    title: "Patient Safety & Verified Misconduct Records for Medical Staff",
    description:
      "To help protect your safety and rights before a visit: check the Ministry of Health and Welfare's registry of medical staff with a final court conviction for a gender-related offense.",
    actionText: "Check the Registry",
  },
  ja: {
    title: "受診時の安全確保と医療従事者の性暴力等処分歴照会",
    description:
      "受診前の安全と権利を守るため、厚生福祉部の専区で、確定判決を受けた違法医療従事者の名簿を確認できます。",
    actionText: "名簿を確認する",
  },
  ko: {
    title: "진료 안전 보호 및 의료인 성비위 확정판결 명단 조회",
    description:
      "진료 전 자신의 안전과 권익을 보호하기 위해, 보건복지부 전용 페이지에서 확정판결을 받은 위법 의료인 명단을 조회할 수 있습니다.",
    actionText: "명단 조회하기",
  },
};

export default async function LocaleClinicsPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("clinics", locale);
  const partnerText = PARTNER_CARD_TEXT[locale];

  return (
    <ToolPageShell slug="clinics" title={meta.title} maxWidthClassName="max-w-3xl" locale={locale}>
      <div className="mb-4">
        <ContextualPartnerCard
          partnerId="mohw-vio"
          compact={true}
          contextTitle={partnerText.title}
          contextDescription={partnerText.description}
          actionText={partnerText.actionText}
        />
      </div>
      <FacilitySearchContent config={facilitySearchConfigs.clinics} slug="clinics" />
    </ToolPageShell>
  );
}
