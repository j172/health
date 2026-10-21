import type { Metadata } from "next";
import Link from "next/link";
import {
  buildToolsIndexGraphJsonLd,
  getBaseUrl,
  SITE_NAME,
} from "@/lib/server/news/seo";
import { TOOL_CATALOG, TOOL_GROUP_META } from "@/lib/server/tools/catalog";
import { buildCategoryPage } from "@/lib/server/tools/navModel";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";
import CivicPartnersSection from "@/components/Common/CivicPartnersSection";

export const revalidate = 300;
export const runtime = "nodejs";

const baseUrl = getBaseUrl();

export const metadata: Metadata = {
  title: "健康工具與公衛資料庫總覽",
  description:
    "免費線上健康計算器、疾病心血管評估、即時紫外線與地震監測，以及全台醫療院所與長照機構開放資料庫總覽。",
  keywords: [
    "健康工具",
    "BMI計算器",
    "卡路里計算機",
    "血壓分析",
    "紫外線指數",
    "健保特約診所",
    "長照機構查詢",
    "食品營養成分",
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
      "免費線上健康計算器、疾病心血管評估、即時紫外線與地震監測，以及全台醫療院所與長照機構開放資料庫總覽。",
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
      "免費線上健康計算器、疾病心血管評估、即時紫外線與地震監測，以及全台醫療院所與長照機構開放資料庫總覽。",
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
  "pest-alerts": "🌱",
  "vet-clinics": "🐾",
  "latest-books": "📖",
  "emergency-hotlines": "🚨",
};

/**
 * The 7 category sections this page renders, derived from the single shared
 * `buildCategoryPage` model (issue #443/#459) instead of a hand-rolled local
 * array. This used to be its own independent `CATEGORIES` list that could
 * (and did) drift from the Nav dropdowns/Footer columns/the new
 * `/tools/category/[slug]` landing pages — tools got added to the catalog
 * and wired into a `ToolGroup`, then stayed invisible here because nobody
 * remembered to append the slug by hand, or a merged group left a section's
 * title/description topically stale. Deriving straight from
 * `TOOL_GROUP_META` + `buildCategoryPage` means every one of those four
 * surfaces now reads the same 7 buckets from the same place, so they can't
 * disagree again.
 */
const SECTIONS = TOOL_GROUP_META.map((meta) => {
  const category = buildCategoryPage(meta.group);
  if (!category) {
    // Unreachable: `meta.group` comes from the same TOOL_GROUP_META list
    // buildCategoryPage looks the group up against, so this would only fire
    // if the two ever desynced — fail loudly rather than silently drop a
    // whole category section.
    throw new Error(`buildCategoryPage returned null for known group "${meta.group}"`);
  }
  return category;
});

export default function ToolsIndexPage() {
  const toolsGraph = buildToolsIndexGraphJsonLd(TOOL_CATALOG);

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
          <section className="mb-12 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
              健康工具與公衛資料庫總覽
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-400">
              提供全台 30+
              款免安裝線上健康試算工具、心肺睡眠量表評估、即時環境監測與公衛醫療機構資料庫檢索。
            </p>
          </section>

          {/* Categorized Tool Sections (Topic Silos) */}
          <div className="space-y-12">
            {SECTIONS.map((category) => {
              const categoryTools = category.tools;

              return (
                <section
                  key={category.group}
                  aria-labelledby={`category-${category.group}`}
                >
                  <div className="mb-4">
                    <h2
                      id={`category-${category.group}`}
                      className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100"
                    >
                      <Link
                        href={`/tools/category/${category.group}`}
                        className="hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        {category.label}
                      </Link>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {categoryTools.length}
                      </span>
                    </h2>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      {category.description}
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {categoryTools.map((tool) => (
                      <Link
                        key={tool.slug}
                        href={`/tools/${tool.slug}`}
                        className="group flex flex-col rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
                      >
                        <div className="flex items-start gap-3.5">
                          <div className="text-3xl transition-transform duration-200 group-hover:scale-110">
                            {TOOL_ICONS[tool.slug] || "📊"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-bold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                              {tool.navLabel ?? tool.title}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                              {tool.directAnswer}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-slate-700 group-hover:text-indigo-600 dark:border-slate-800 dark:text-slate-300 dark:group-hover:text-indigo-400">
                          <span>立即使用</span>
                          <span className="transition-transform duration-200 group-hover:translate-x-1">
                            →
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Civic Partners Showcase */}
          <CivicPartnersSection />
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
