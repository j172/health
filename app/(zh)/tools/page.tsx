import type { Metadata } from "next";
import {
  buildToolsIndexGraphJsonLd,
  getBaseUrl,
  SITE_NAME,
} from "@/lib/server/news/seo";
import { TOOL_CATALOG, TOOL_GROUP_META } from "@/lib/server/tools/catalog";
import { buildCategoryPage } from "@/lib/server/tools/navModel";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";
import CivicPartnersSection from "@/components/Common/CivicPartnersSection";
import ToolsIndexClient from "@/components/Tools/ToolsIndexClient";

export const revalidate = 300;
export const runtime = "nodejs";

const baseUrl = getBaseUrl();

export const metadata: Metadata = {
  title: "健康工具與公衛資料庫總覽",
  description:
    "免費線上健康計算器、長照與兒少福利查詢、醫療照護院所、交通能源、防災示警、遠離詐騙與成癮防治等全臺 80+ 款民生開放資料便民工具總覽。",
  keywords: [
    "健康工具",
    "BMI計算器",
    "卡路里計算機",
    "血壓分析",
    "紫外線指數",
    "健保特約診所",
    "長照機構查詢",
    "食品營養成分",
    "台灣便民工具",
    "臺灣便民生活工具",
    "兒少托育與補助查詢",
    "165反詐騙查詢",
    "戒菸與心理健康",
    "防災示警與天氣警報",
    "交通能源查詢",
  ],
  alternates: { canonical: `${baseUrl}/tools` },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    title: `健康工具與公衛資料庫總覽 | ${SITE_NAME}`,
    description:
      "免費線上健康計算器、長照與兒少福利查詢、醫療照護院所、交通能源、防災示警、遠離詐騙與成癮防治等全臺 80+ 款民生開放資料便民工具總覽。",
    url: `${baseUrl}/tools`,
    siteName: SITE_NAME,
    locale: "zh_TW",
    alternateLocale: ["en_US"],
    images: [
      { url: `${baseUrl}/images/og/tools.png`, width: 1200, height: 630 },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `健康工具與公衛資料庫總覽 | ${SITE_NAME}`,
    description:
      "免費線上健康計算器、長照與兒少福利查詢、醫療照護院所、交通能源、防災示警、遠離詐騙與成癮防治等全臺 80+ 款民生開放資料便民工具總覽。",
    images: [`${baseUrl}/images/og/tools.png`],
  },
};

const TOOL_ICONS: Record<string, string> = {
  uv: "☀️",
  bmi: "⚖️",
  calories: "🔥",
  nutrition: "🥗",
  water: "💧",
  "body-fat": "🔬",
  "waist-hip": "📏",
  "heart-rate": "❤️",
  "blood-pressure": "🩺",
  sleep: "😴",
  stress: "🧠",
  lbm: "💪",
  vo2max: "🫁",
  aqi: "🌬️",
  clinics: "🏥",
  pharmacies: "🏪",
  drugs: "💊",
  "food-nutrition": "🥑",
  "food-operators": "🏬",
  "health-checks": "🩻",
  "long-term-care": "🏡",
  "disability-welfare": "♿",
  "disability-atm": "🏧",
  "child-welfare-institutions": "👶",
  "weather-alerts": "⛈️",
  "public-toilets": "🚻",
  kindergartens: "🧩",
  "cram-schools": "📚",
  "child-safety-spots": "🛟",
  "npo-organizations": "🤝",
  "tax-organizations": "🤝",
  "cool-spots": "🧊",
  "iaq-premises": "💨",
  "cleaning-squads": "🚛",
  "carbon-footprint": "🌍",
  "aqx-monitoring": "🧪",
  "water-conditions": "💧",
  "green-certifications": "🌿",
  "disaster-map": "🆘",
  "heritage-map": "🏛️",
  "vet-clinics": "🐾",
  "latest-books": "📖",
  "emergency-hotlines": "🚨",
  "accessible-parking": "🅿️",
  "accessible-transit": "🚌",
  "adult-preventive-care": "🩺",
  aed: "⚡",
  "pesticide-sales": "🌾",
  "anti-fraud": "🛡️",
  "senior-friendly": "🧓",
  "audible-signals": "🔊",
  "baby-friendly-hospitals": "🤱",
  bookstores: "📚",
  "breastfeeding-rooms": "🍼",
  "child-native-languages": "🗣️",
  "child-subsidies": "🧧",
  "childcare-centers": "🧸",
  "home-emergency-care": "🏥",
  "hearing-aid-subsidies": "🦻",
  "contraception-map": "💊",
  "cpc-prices": "⛽",
  "cultural-events": "🎭",
  "early-intervention": "🌱",
  "emergency-supplies": "🎒",
  "er-status": "🚑",
  "food-safety": "🥬",
  "funeral-facilities": "🕯️",
  "global-watch": "🌐",
  "health-supplements": "🍯",
  "inundation-map": "🌊",
  "ltc-benefits": "🧮",
  "medical-violators": "⚠️",
  "mental-health": "💚",
  "organ-donation-hospitals": "🎗️",
  "outdoor-safety": "🏃",
  "pet-adoption": "🐶",
  "postpartum-care": "🛏️",
  "power-grid-overview": "🔋",
  "public-art": "🎨",
  "rare-disease-care": "🔬",
  "sheltered-workshops": "🏪",
  "smoking-cessation": "🚭",
  "social-welfare-centers": "🏛️",
  "tourism-factories": "🏭",
  "water-outages": "🚰",
  "work-school-status": "📅",
};

const SECTIONS = TOOL_GROUP_META.map((meta) => {
  const category = buildCategoryPage(meta.group);
  if (!category) {
    throw new Error(`buildCategoryPage returned null for known group "${meta.group}"`);
  }
  return category;
});

export default function ToolsIndexPage() {
  const toolsGraph = buildToolsIndexGraphJsonLd(TOOL_CATALOG);
  const toolMap = new Map(TOOL_CATALOG.map((t) => [t.slug, t]));

  const categoriesData = SECTIONS.map((section) => ({
    group: section.group,
    label: section.label,
    description: section.description,
    tools: section.tools.map((t) => {
      const entry = toolMap.get(t.slug);
      return {
        slug: t.slug,
        title: t.title,
        navLabel: t.navLabel,
        directAnswer: t.directAnswer,
        keywords: entry?.keywords || [],
        group: section.group,
      };
    }),
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(toolsGraph) }}
      />

      <div className="min-h-screen bg-slate-50/50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
        <StabloHeader />

        <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          {/* Header section */}
          <section className="mb-8 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
              健康工具與公衛資料庫總覽
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-400">
              提供全臺 {TOOL_CATALOG.length} 款免安裝線上便民工具，涵蓋長照與社福、婦幼兒少、健康自我評估、就醫用藥、交通能源、防災示警、環境食安及遠離詐騙與成癮防治。
            </p>
          </section>

          {/* Interactive Tools Directory Client (Sticky Pills, Instant Search, Sub-tools)
              Each category links to href={`/tools/category/${category.group}`} */}
          <ToolsIndexClient
            categories={categoriesData}
            toolIcons={TOOL_ICONS}
            totalCount={TOOL_CATALOG.length}
          />

          {/* Civic Partners Showcase */}
          <CivicPartnersSection />
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
