import type { Metadata } from "next";
import Link from "next/link";
import { buildBreadcrumbJsonLd, buildItemListJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const baseUrl = getBaseUrl();

export const metadata: Metadata = {
  title: "健康工具與公衛資料庫總覽",
  description: "免費線上健康計算器、疾病心血管評估、即時紫外線與地震監測，以及全台醫療院所與長照機構開放資料庫總覽。",
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
  openGraph: {
    type: "website",
    title: `健康工具與公衛資料庫總覽 | ${SITE_NAME}`,
    description: "免費線上健康計算器、疾病心血管評估、即時紫外線與地震監測，以及全台醫療院所與長照機構開放資料庫總覽。",
    url: `${baseUrl}/tools`,
    siteName: SITE_NAME,
    locale: "zh_TW",
    alternateLocale: ["zh_CN", "en_US"],
    images: [{ url: `${baseUrl}/images/og/tools.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `健康工具與公衛資料庫總覽 | ${SITE_NAME}`,
    description: "免費線上健康計算器、疾病心血管評估、即時紫外線與地震監測，以及全台醫療院所與長照機構開放資料庫總覽。",
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
  "hakka-community": "🏘️",
  "green-shops": "🌿",
  "child-welfare-nurseries": "👶",
  "child-welfare-centers": "🎈",
};

const CATEGORIES = [
  {
    id: "body",
    title: "身體組成與代謝評估",
    description: "依據衛福部國健署、WHO 與國際醫學公式評估身體質量、體脂率與熱量需求",
    slugs: ["bmi", "calories", "nutrition", "water", "body-fat", "waist-hip", "lbm"],
  },
  {
    id: "cardio",
    title: "心血管、睡眠與心理評估",
    description: "依據 2023 ESH 高血壓指引、Karvonen 公式、PSQI 與 PSS-10 量表量化健康狀態",
    slugs: ["heart-rate", "blood-pressure", "vo2max", "sleep", "stress"],
  },
  {
    id: "environment",
    title: "即時環境與防災觀測",
    description: "中央氣象署、環境部、USGS 即時連線紫外線、AQI 空氣品質與顯著地震監測",
    slugs: ["uv", "aqi", "earthquakes"],
  },
  {
    id: "facility",
    title: "醫療院所與長照福利資源",
    description: "全台健保特約醫院、診所、藥局、長照 2.0、居家醫療與福利機構檢索",
    slugs: [
      "clinics",
      "pharmacies",
      "drugs",
      "health-checks",
      "home-healthcare",
      "long-term-care",
      "ltc-contracted",
      "elder-welfare",
      "disability-welfare",
      "disability-atm",
      "hakka-community",
      "child-welfare-nurseries",
      "child-welfare-centers",
    ],
  },
  {
    id: "food",
    title: "食品營養與綠色生活",
    description: "衛福部食藥署食品營養成分、食品業者登錄與環境部認證綠色商店",
    slugs: ["food-nutrition", "food-operators", "green-shops"],
  },
];

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
    }))
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />

      <div className="min-h-screen bg-slate-50/50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
        <StabloHeader />

        <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          {/* Header section */}
          <section className="mb-12 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
              健康工具與公衛資料庫總覽
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">
              提供全台 30+ 款免安裝線上健康試算工具、心肺睡眠量表評估、即時環境監測與公衛醫療機構資料庫檢索。
            </p>
          </section>

          {/* Categorized Tool Sections (Topic Silos) */}
          <div className="space-y-12">
            {CATEGORIES.map((category) => {
              const categoryTools = category.slugs
                .map((slug) => TOOL_CATALOG.find((t) => t.slug === slug))
                .filter((t): t is NonNullable<typeof t> => Boolean(t));

              if (categoryTools.length === 0) return null;

              return (
                <section key={category.id} aria-labelledby={`category-${category.id}`}>
                  <div className="mb-4">
                    <h2
                      id={`category-${category.id}`}
                      className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"
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
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400 truncate">
                              {tool.title}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                              {tool.description}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                          <span>立即使用</span>
                          <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
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
