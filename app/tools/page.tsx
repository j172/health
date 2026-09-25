import type { Metadata } from "next";
import Link from "next/link";
import {
  buildToolsIndexGraphJsonLd,
  getBaseUrl,
  SITE_NAME,
} from "@/lib/server/news/seo";
import {
  TOOL_CATALOG,
  compareToolTitles,
  type ToolCatalogEntry,
  type ToolGroup,
} from "@/lib/server/tools/catalog";
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
  earthquakes: "🌋",
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
  "home-healthcare": "🏠",
  "disability-welfare": "♿",
  "disability-atm": "🏧",
  "elder-welfare": "👵",
  "ltc-contracted": "🤝",
  "hakka-bogong": "🧓",
  "child-welfare-institutions": "👶",
  "weather-alerts": "⛈️",
  "public-toilets": "🚻",
  kindergartens: "🧩",
  "cram-schools": "📚",
  "child-safety-spots": "🛟",
  "npo-organizations": "🤝",
  "tax-organizations": "🤝",
  "travel-epidemic-alerts": "🌍",
  "cool-spots": "🧊",
  "iaq-premises": "💨",
  "cleaning-squads": "🧹",
  "carbon-footprint": "🌍",
  "aqx-monitoring": "🧪",
  "water-conditions": "💧",
  "green-certifications": "🌿",
  "disaster-map": "🆘",
  "heritage-map": "🏛️",
  "metro-alerts": "🚇",
  youbike: "🚲",
  "pest-alerts": "🌱",
  "vet-clinics": "🐾",
  "latest-books": "📖",
  "emergency-hotlines": "🚨",
};

interface ToolCategory {
  id: string;
  title: string;
  description: string;
  /**
   * Membership comes from ToolGroup, so this page cannot drift away from the
   * nav dropdowns and the footer columns (issue #256 reclassification: both
   * derive from the same 9 `TOOL_GROUP_META` buckets in catalog.ts). It had
   * drifted before: tools were added to the catalog, wired into a group, and
   * stayed invisible here because nobody remembered to append the slug by
   * hand.
   *
   * `slugs` is the exception, for the three curated sections below that split
   * a group's tools into a finer distinction no group boundary expresses (the
   * twelve `calculator` tools into "body" vs. "cardio", and `registry` named
   * as the drug/food registry-lookup section it actually is). Every group
   * appears exactly once across these `slugs` sections and the `groups`
   * sections further down — otherwise a tool would double-render.
   */
  groups?: ToolGroup[];
  slugs?: string[];
}

const CATEGORIES: ToolCategory[] = [
  {
    id: "body",
    title: "身體組成與代謝評估",
    description:
      "依據衛福部國健署、WHO 與國際醫學公式評估身體質量、體脂率與熱量需求",
    slugs: [
      "bmi",
      "calories",
      "nutrition",
      "water",
      "body-fat",
      "waist-hip",
      "lbm",
    ],
  },
  {
    id: "cardio",
    title: "心血管、睡眠與心理評估",
    description:
      "依據 2023 ESH 高血壓指引、Karvonen 公式、PSQI 與 PSS-10 量表量化健康狀態",
    slugs: ["heart-rate", "blood-pressure", "vo2max", "sleep", "stress"],
  },
  {
    // The entire "registry" group (issue #256), named for what it actually
    // is — drug/food registry & composition lookups — rather than as a
    // groups-based section, so its tools don't also need excluding from a
    // separate `groups: ["registry"]` section elsewhere in this list.
    id: "registry",
    title: "藥品食品登錄查詢",
    description: "衛福部食藥署藥品許可證、食品營養成分與食品業者登錄資料庫",
    slugs: ["drugs", "food-nutrition", "food-operators"],
  },
  {
    id: "care-facility",
    title: "醫療照護機構",
    description:
      "全台健保特約醫院、診所、藥局、健康檢查機構、長照 2.0、居家醫療、老人與身心障礙福利機構檢索",
    groups: ["care-facility"],
  },
  {
    id: "child-welfare",
    title: "兒少福利與教育資源",
    description: "全國親子館與兒少福利中心、幼兒園、短期補習班、本土語言辭典",
    groups: ["child-welfare"],
  },
  {
    id: "disaster-safety",
    title: "防災與安全示警",
    description:
      "紫外線、地震、天氣警報、防災地圖、婦幼安全警示地點、國際旅遊疫情與農作物病蟲害預警",
    groups: ["disaster-safety"],
  },
  {
    id: "transport-energy",
    title: "交通與能源",
    description:
      "YouBike、中油油價與站點地圖、電力概況儀表板與捷運營運公告",
    groups: ["transport-energy"],
  },
  {
    id: "environment",
    title: "環境品質與綠色生活",
    description:
      "AQI／AQX 空品監測、室內空氣品質公告場所、水情（水位站／水庫）、地方清潔隊、環保標章與碳足跡查詢",
    groups: ["environment"],
  },
  {
    id: "culture-tourism",
    title: "文化藝術與觀光",
    description:
      "全國藝文展覽與親子活動、公共藝術與演藝場所地圖、文化資產地圖、實體書店與觀光工廠",
    groups: ["culture-tourism"],
  },
  {
    id: "life-services",
    title: "公益與生活服務",
    description:
      "非營利組織(NPO)、公廁、涼適點、無障礙ATM、毛孩認養與動物醫院查詢",
    groups: ["life-services"],
  },
];

const byTitle = (a: ToolCatalogEntry, b: ToolCatalogEntry) =>
  compareToolTitles(a.title, b.title);

/**
 * Categories resolved to their tools, plus a catch-all.
 *
 * Collated per SPECIFICATION.md 5.1 rather than left in catalog order — this is
 * the page where readers actually browse. Anything a category does not claim
 * lands in 其他工具 rather than vanishing, so the next un-categorised group is
 * visible on the page instead of silently missing from it.
 */
const SECTIONS = (() => {
  const claimed = new Set<string>();
  const sections = CATEGORIES.map((category) => {
    const tools = (
      category.groups
        ? TOOL_CATALOG.filter((tool) => category.groups!.includes(tool.group))
        : (category.slugs ?? [])
            .map((slug) => TOOL_CATALOG.find((tool) => tool.slug === slug))
            .filter((tool): tool is ToolCatalogEntry => Boolean(tool))
    )
      .slice()
      .sort(byTitle);
    tools.forEach((tool) => claimed.add(tool.slug));
    return { ...category, tools };
  }).filter((section) => section.tools.length > 0);

  const leftover = TOOL_CATALOG.filter(
    (tool) => !claimed.has(tool.slug),
  ).sort(byTitle);

  return leftover.length > 0
    ? [
        ...sections,
        {
          id: "other",
          title: "其他工具",
          description: "尚未歸入上列主題的工具",
          tools: leftover,
        },
      ]
    : sections;
})();

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
                  key={category.id}
                  aria-labelledby={`category-${category.id}`}
                >
                  <div className="mb-4">
                    <h2
                      id={`category-${category.id}`}
                      className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100"
                    >
                      <span>{category.title}</span>
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
                              {tool.title}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                              {tool.description}
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
