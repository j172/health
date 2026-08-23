import type { Metadata } from "next";
import Link from "next/link";
import {
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
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

export const dynamic = "force-dynamic";
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
    alternateLocale: ["zh_CN", "en_US"],
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
  "green-shops": "🌿",
  "child-welfare-nurseries": "👶",
  "child-welfare-centers": "🎈",
  "weather-alerts": "⛈️",
  "public-toilets": "🚻",
  kindergartens: "🧩",
  "cram-schools": "📚",
  "child-safety-spots": "🛟",
  "family-cultural-activities": "🎭",
  "tax-organizations": "🧾",
  "travel-epidemic-alerts": "🌍",
};

interface ToolCategory {
  id: string;
  title: string;
  description: string;
  /**
   * Membership comes from ToolGroup, so this page cannot drift away from the
   * nav dropdowns and the footer columns. It had drifted twice already: tools
   * were added to the catalog, wired into a group, and stayed invisible here
   * because nobody remembered to append the slug by hand.
   *
   * `slugs` is the single exception — the twelve calculators are split into two
   * curated sections, a distinction no group boundary expresses.
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
    id: "environment",
    title: "即時環境監測",
    description:
      "中央氣象署、環境部、USGS 即時連線氣象與海嘯警報、紫外線、AQI 空氣品質與顯著地震監測",
    groups: ["weather"],
  },
  {
    id: "facility",
    title: "醫療院所與長照福利資源",
    description:
      "全台健保特約醫院、診所、藥局、長照 2.0、居家醫療與身心障礙福利機構檢索",
    groups: ["facility", "ltc", "disability"],
  },
  {
    id: "child-welfare",
    title: "兒少福利與教育資源",
    description:
      "全國親子館、兒少福利中心、幼兒園、短期補習班、婦幼安全警示地點與親子藝文活動",
    groups: ["child-welfare"],
  },
  {
    id: "food",
    title: "食品營養與業者登錄",
    description: "衛福部食藥署食品營養成分分析與食品業者合法登錄資料庫",
    groups: ["food"],
  },
  {
    id: "public-facility",
    title: "便民服務",
    description:
      "全國公廁、環境部認證綠色商店、機關團體扣繳單位與國際旅遊疫情警示查詢",
    groups: ["public-facility"],
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
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "首頁", url: baseUrl },
    { name: "健康工具與公衛資料庫", url: `${baseUrl}/tools` },
  ]);

  const itemList = buildItemListJsonLd(
    "健康工具與公衛資料庫目錄",
    TOOL_CATALOG.map((tool) => ({
      name: tool.title,
      url: `${baseUrl}/tools/${tool.slug}`,
      description: tool.description,
    })),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
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
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
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
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
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
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
