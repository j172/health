import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import EmergencyRoomContent from "@/components/Tools/EmergencyRoomContent";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";
import { getEmergencyRoomOverview } from "@/lib/server/emergencyRooms/queries";
import { isPathLocale, ogAlternateLocales, OG_LOCALE, type PathLocale } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

// Issue #485 pilot page 2/3 — thin locale-parameterized twin of
// app/(zh)/tools/er-status/page.tsx, same ToolPageShell + EmergencyRoomContent
// components, same server-side getEmergencyRoomOverview() ISR-friendly fetch
// (see that file's comment on why it's deliberately not reading
// searchParams here either) — hospital names/addresses from the live DB
// stay in Chinese, with the Google Maps navigation button localized via
// getNavigationButtonLabel() inside EmergencyRoomContent.tsx.

export const revalidate = 30;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/tools/er-status";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("er-status", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    keywords: ["emergency room", "ER wait times Taiwan", "hospital congestion"],
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
    title: "ER Triage Awareness & Everyday Preparedness",
    description:
      "Use emergency medical resources wisely — a regular outpatient clinic is the better choice for non-critical conditions. Day to day, Kuma Academy (黑熊學院) teaches what belongs in a family first-aid kit and the basics of immediate self-administered bleeding control.",
  },
  ja: {
    title: "救急トリアージの理解と日頃の備え",
    description:
      "緊急医療資源を正しく活用しましょう。重症でない場合は一般外来の受診をご検討ください。日頃から「黒熊学院（Kuma Academy）」で家庭用応急処置キットの必須品や応急止血の基本を学んでおくことをおすすめします。",
  },
  ko: {
    title: "응급실 분산 이용과 평소 대비",
    description:
      "응급 의료 자원을 합리적으로 활용하세요. 위급하지 않은 증상은 일반 외래를 이용하는 것이 좋습니다. 평소에 'Kuma Academy(흑곰학원)'에서 가정용 응급처치 키트 필수품과 즉각적인 지혈·자가구조 기본 개념을 익혀두세요.",
  },
};

export default async function LocaleErStatusPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedToolMeta("er-status", locale);
  const partnerText = PARTNER_CARD_TEXT[locale];

  // Same ISR-friendly server fetch as the zh page — see that file's comment
  // on deliberately not reading searchParams here so the shared 30s cache
  // isn't bypassed for every visitor.
  let initialData;
  try {
    initialData = await getEmergencyRoomOverview();
  } catch (err) {
    console.warn("Failed to fetch initial ER data on server:", err);
  }

  return (
    <ToolPageShell slug="er-status" title={meta.title} maxWidthClassName="max-w-6xl" locale={locale}>
      <ContextualPartnerCard
        partnerId="kuma"
        contextTitle={partnerText.title}
        contextDescription={partnerText.description}
      />
      <Suspense>
        <EmergencyRoomContent initialData={initialData} />
      </Suspense>
    </ToolPageShell>
  );
}
