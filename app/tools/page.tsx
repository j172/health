import type { Metadata } from "next";
import Link from "next/link";
import { buildBreadcrumbJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";

// StabloHeader renders a live DB-backed weather-alert bar (same as /news),
// so this page can't be statically prerendered at build time either.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const baseUrl = getBaseUrl();

export const metadata: Metadata = {
  title: "健康工具",
  description: "免費線上健康計算與評估工具，幫助您掌握身體狀態。",
  alternates: { canonical: `${baseUrl}/tools` },
};

// Each entry maps to an implemented app/tools/<href> page — only list tools
// that actually exist yet, so this page never links to a 404.
const TOOLS = [
  { href: "/tools/bmi", title: "BMI 計算器", description: "根據身高、體重計算 BMI 值，對照台灣國健署標準了解體重狀態。", icon: "⚖️" },
  { href: "/tools/calories", title: "卡路里需求計算器", description: "根據年齡、性別、身高、體重與活動量，計算每日所需熱量攝取。", icon: "🔥" },
  { href: "/tools/nutrition", title: "每日營養素建議計算器", description: "依個人體型、活動量與飲食目標，提供三大營養素攝取建議。", icon: "🥗" },
  { href: "/tools/water", title: "飲水量計算器", description: "依體重與活動量計算每日建議飲水量，並提供分段補水時間表。", icon: "💧" },
  { href: "/tools/body-fat", title: "體脂率計算器", description: "採用美國海軍體脂計算法，計算體脂率、脂肪質量與肌肉量。", icon: "🔬" },
  { href: "/tools/waist-hip", title: "腰臀比計算器", description: "計算腰臀比（WHR），依 WHO 標準評估腹部肥胖與心血管代謝風險。", icon: "📏" },
  { href: "/tools/heart-rate", title: "目標心率計算器", description: "使用 Karvonen 公式計算 5 個運動強度心率區間。", icon: "❤️" },
  { href: "/tools/blood-pressure", title: "血壓分析器", description: "依 2023 ESH 高血壓指南分類血壓等級，支援多次記錄與平均值分析。", icon: "🩺" },
  { href: "/tools/sleep", title: "睡眠品質評估", description: "基於 PSQI 量表 7 個面向，評估您的睡眠狀況並提供改善建議。", icon: "😴" },
  { href: "/tools/stress", title: "壓力評估測驗", description: "採用 PSS-10 知覺壓力量表，量化壓力程度並提供個人化減壓策略。", icon: "🧠" },
  { href: "/tools/lbm", title: "去脂體重 (LBM) 計算器", description: "以 Boer 公式估算去脂體重與體脂率，了解身體組成狀況。", icon: "💪" },
  { href: "/tools/vo2max", title: "VO2Max 估算器", description: "以 Uth 公式快速評估最大攝氧量，了解心肺耐力等級。", icon: "🫁" },
  { href: "/tools/aqi", title: "AQI 空氣品質即時查詢", description: "即時顯示全台環境部監測站 AQI 空氣品質指標。", icon: "🌬️" },
];

export default function ToolsIndexPage() {
  const breadcrumb = buildBreadcrumbJsonLd([
    { name: "首頁", url: baseUrl },
    { name: "健康工具", url: `${baseUrl}/tools` },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <div className="min-h-screen bg-white text-neutral-800">
        <StabloHeader />

        <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
          <section className="mb-10 text-center">
            <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.025em] text-neutral-800">健康工具</h1>
            <p className="mt-2 text-[16px] leading-6 text-neutral-600">免費線上健康計算與評估工具，幫助您掌握身體狀態。</p>
          </section>

          <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="group flex flex-col rounded-none border border-neutral-200 p-6 transition-colors hover:border-neutral-400"
              >
                <div className="mb-4 text-4xl">{tool.icon}</div>
                <h2 className="mb-2 text-lg font-semibold text-neutral-800 group-hover:text-neutral-900">{tool.title}</h2>
                <p className="flex-1 text-sm text-neutral-600">{tool.description}</p>
                <span className="mt-4 text-sm font-medium text-neutral-800 group-hover:underline">立即使用 →</span>
              </Link>
            ))}
          </section>
        </main>

        <StabloFooter />
      </div>
    </>
  );
}
