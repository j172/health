import Link from "next/link";
import { StabloHeader, StabloFooter } from "@/components/News/StabloNewsLayout";

export const metadata = {
  title: "404 - 找不到此頁面 | j172tw Healthz",
  description: "抱歉，您所尋找的頁面不存在或已被移除。您可以探索全台公衛新聞、線上健康試算工具或醫療機構資料庫。",
  robots: { index: false, follow: true },
};

const POPULAR_TOOLS = [
  { href: "/tools/bmi", title: "BMI 計算器", icon: "⚖️" },
  { href: "/tools/calories", title: "卡路里需求計算器", icon: "🔥" },
  { href: "/tools/blood-pressure", title: "血壓分析器", icon: "🩺" },
  { href: "/tools/uv", title: "即時紫外線指數", icon: "☀️" },
  { href: "/tools/aqi", title: "全台空氣品質 AQI", icon: "🌬️" },
  { href: "/tools/clinics", title: "醫療院所查詢", icon: "🏥" },
  { href: "/tools/pharmacies", title: "特約藥局查詢", icon: "🏪" },
  { href: "/tools/food-nutrition", title: "食品營養成分查詢", icon: "🥑" },
];

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 flex flex-col justify-between">
      <StabloHeader />

      <main className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 lg:px-8 flex-1 flex flex-col justify-center">
        <div className="inline-flex mx-auto items-center justify-center w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold text-xl mb-6">
          404
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          抱歉，您所尋找的頁面不存在
        </h1>

        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          可能該網址已變更、內容已下架，或輸入的網址有誤。您可以搜尋新聞、使用下方熱門健康工具，或返回網站首頁。
        </p>

        {/* Search Bar Redirect */}
        <form action="/news" method="GET" className="mt-6 flex max-w-md mx-auto w-full gap-2">
          <input
            type="text"
            name="keyword"
            placeholder="搜尋公衛新聞或醫療關鍵字..."
            aria-label="搜尋關鍵字"
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 shadow-2xs"
          />
          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            搜尋
          </button>
        </form>

        {/* Popular Tools Navigation */}
        <div className="mt-10 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 text-left">
            🔥 熱門推薦健康工具與資料庫
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {POPULAR_TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:bg-slate-850 dark:text-slate-300 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-400"
              >
                <span>{tool.icon}</span>
                <span className="truncate">{tool.title}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            返回首頁
          </Link>
          <Link
            href="/news"
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-850"
          >
            最新健康新聞
          </Link>
          <Link
            href="/tools"
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-850"
          >
            全部 30+ 工具目錄
          </Link>
        </div>
      </main>

      <StabloFooter />
    </div>
  );
}
