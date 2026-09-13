"use client";

import { useState, useMemo } from "react";
import type { CpcPriceItem, CpcPriceSummary } from "@/lib/server/cpc/prices";

interface CpcPricesClientProps {
  initialItems: CpcPriceItem[];
  initialCategories: string[];
  initialSummary: CpcPriceSummary;
  updatedAt: string;
}

const TAB_OPTIONS = [
  { id: "all", label: "全部品項", icon: "📋" },
  { id: "retail", label: "🚗 汽柴油零售", match: ["汽柴油零售"] },
  { id: "gas", label: "🔥 天然氣與瓦斯", match: ["天然氣", "液化石油氣"] },
  { id: "fuel", label: "🏭 工業燃料油", match: ["燃料油"] },
  { id: "transport", label: "🚢 海運與航空", match: ["海運用油", "航空燃油"] },
  { id: "liquor", label: "🍶 生技與酒類", match: ["中油生技/酒類"] },
  { id: "sixtype", label: "🛢️ 六大類油品", match: ["六大類油品"] },
  { id: "lngCost", label: "📊 天然氣氣源成本", match: ["液化天然氣氣源成本"] },
];

export default function CpcPricesClient({
  initialItems,
  initialCategories,
  initialSummary,
  updatedAt,
}: CpcPricesClientProps) {
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"default" | "priceAsc" | "priceDesc" | "name">("default");

  const gas = initialSummary.gasoline;
  const ng = initialSummary.naturalGas;

  // Filter items by active tab and search query
  const filteredItems = useMemo(() => {
    let result = [...initialItems];

    // Filter by tab
    if (activeTab !== "all") {
      const tabDef = TAB_OPTIONS.find((t) => t.id === activeTab);
      if (tabDef && tabDef.match) {
        result = result.filter((item) => tabDef.match.includes(item.category));
      }
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (i) =>
          i.productName.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          (i.productCode && i.productCode.toLowerCase().includes(q)) ||
          (i.deliveryPoint && i.deliveryPoint.toLowerCase().includes(q)) ||
          (i.targetCustomer && i.targetCustomer.toLowerCase().includes(q)),
      );
    }

    // Sort
    if (sortBy === "priceAsc") {
      result.sort((a, b) => a.price - b.price);
    } else if (sortBy === "priceDesc") {
      result.sort((a, b) => b.price - a.price);
    } else if (sortBy === "name") {
      result.sort((a, b) => a.productName.localeCompare(b.productName, "zh-Hant"));
    }

    return result;
  }, [initialItems, activeTab, searchQuery, sortBy]);

  return (
    <div className="space-y-8">
      {/* Hero Quick Look Section */}
      <section className="relative overflow-hidden rounded-3xl border border-blue-100/80 bg-gradient-to-br from-blue-50/70 via-indigo-50/30 to-white p-6 shadow-sm dark:border-blue-900/30 dark:from-slate-900 dark:via-blue-950/20 dark:to-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/60 bg-blue-100/50 px-3 py-1 text-xs font-semibold text-blue-800 dark:border-blue-800/60 dark:bg-blue-950/60 dark:text-blue-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600"></span>
              </span>
              中油官方浮動油價公告
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              本期焦點汽柴油與天然氣牌價
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              生效日期：
              <span className="font-semibold text-blue-700 dark:text-blue-400">
                {initialSummary.effectiveDate || "依最新公布"} 起
              </span>{" "}
              · 營業稅 5% 內含
            </p>
          </div>
          <div className="text-right text-xs text-slate-400">
            資料更新時間：{new Date(updatedAt).toLocaleDateString("zh-TW")}
          </div>
        </div>

        {/* 6 Hero Metrics Grid */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {/* 95 無鉛 */}
          <div className="relative overflow-hidden rounded-2xl border border-blue-200/80 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-blue-800/50 dark:bg-slate-800/90">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-blue-600 dark:text-blue-400">95 無鉛</span>
              <span>元/公升</span>
            </div>
            <div className="mt-2 text-2xl font-black tracking-tight text-blue-700 dark:text-blue-300">
              ${gas?.unleaded95?.price !== undefined ? gas.unleaded95.price.toFixed(1) : "--"}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">最熱門自用車汽油</div>
          </div>

          {/* 92 無鉛 */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-700/60 dark:bg-slate-800/90">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-200">92 無鉛</span>
              <span>元/公升</span>
            </div>
            <div className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
              ${gas?.unleaded92?.price !== undefined ? gas.unleaded92.price.toFixed(1) : "--"}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">經濟型機車與汽車</div>
          </div>

          {/* 98 無鉛 */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-700/60 dark:bg-slate-800/90">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-purple-600 dark:text-purple-400">98 無鉛</span>
              <span>元/公升</span>
            </div>
            <div className="mt-2 text-2xl font-black tracking-tight text-purple-700 dark:text-purple-300">
              ${gas?.unleaded98?.price !== undefined ? gas.unleaded98.price.toFixed(1) : "--"}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">高壓縮比與渦輪引擎</div>
          </div>

          {/* 超級柴油 */}
          <div className="rounded-2xl border border-amber-200/80 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-amber-800/50 dark:bg-slate-800/90">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-amber-600 dark:text-amber-400">超級柴油</span>
              <span>元/公升</span>
            </div>
            <div className="mt-2 text-2xl font-black tracking-tight text-amber-700 dark:text-amber-300">
              ${gas?.diesel?.price !== undefined ? gas.diesel.price.toFixed(1) : "--"}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">客貨運與柴油休旅</div>
          </div>

          {/* 天然氣(1) */}
          <div className="rounded-2xl border border-orange-200/80 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-orange-800/50 dark:bg-slate-800/90">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-orange-600 dark:text-orange-400">天然氣 (1)</span>
              <span>元/度</span>
            </div>
            <div className="mt-2 text-2xl font-black tracking-tight text-orange-700 dark:text-orange-300">
              ${ng?.ng1?.price !== undefined ? ng.ng1.price.toFixed(2) : "--"}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">公用/家庭熱水煮食</div>
          </div>

          {/* 天然氣(2) */}
          <div className="rounded-2xl border border-emerald-200/80 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-emerald-800/50 dark:bg-slate-800/90">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">天然氣 (2)</span>
              <span>元/度</span>
            </div>
            <div className="mt-2 text-2xl font-black tracking-tight text-emerald-700 dark:text-emerald-300">
              ${ng?.ng2?.price !== undefined ? ng.ng2.price.toFixed(2) : "--"}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">公用天然氣分區</div>
          </div>
        </div>
      </section>

      {/* Category Tabs & Search Bar */}
      <section className="space-y-4">
        {/* Category Pills */}
        <div className="flex flex-wrap gap-2">
          {TAB_OPTIONS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30 dark:bg-blue-500"
                    : "border border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Filter bar: Search Input & Sort Selector */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋產品名稱、編號、包裝或交貨地點..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                清除
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">排序：</span>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="default">預設排序</option>
              <option value="priceAsc">金額：由低到高</option>
              <option value="priceDesc">金額：由高到低</option>
              <option value="name">產品名稱排序</option>
            </select>
            <span className="ml-2 text-xs font-semibold text-slate-400">
              共 {filteredItems.length} 筆
            </span>
          </div>
        </div>
      </section>

      {/* Main Data Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3.5">產品名稱 / 編號</th>
                <th className="px-4 py-3.5">分類</th>
                <th className="px-4 py-3.5">包裝 / 銷售對象</th>
                <th className="px-4 py-3.5">交貨地點</th>
                <th className="px-4 py-3.5 text-right">參考牌價</th>
                <th className="px-4 py-3.5">計價單位</th>
                <th className="px-4 py-3.5">生效日期</th>
                <th className="px-4 py-3.5">稅賦與備註</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    查無符合條件的牌價資料
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => (
                  <tr
                    key={`${item.category}-${item.productName}-${item.packageType}-${idx}`}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        {item.productName}
                      </div>
                      {item.productCode && (
                        <div className="font-mono text-[11px] text-slate-400">
                          {item.productCode}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <div>{item.packageType || "散裝"}</div>
                      {item.targetCustomer && (
                        <div className="text-slate-400">{item.targetCustomer}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400 max-w-[180px] truncate">
                      {item.deliveryPoint || "中油指定儲運處/自營站"}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <span className="text-base font-bold text-blue-700 dark:text-blue-400">
                        ${item.price.toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs font-medium">
                      {item.unit}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs font-mono">
                      {item.effectiveDateFormatted || item.effectiveDate}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <div className="flex flex-wrap gap-1">
                        {item.taxDesc && item.taxDesc !== "0" && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                            稅: {item.taxDesc}%
                          </span>
                        )}
                        {item.goodsTax && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            貨物稅: {item.goodsTax}
                          </span>
                        )}
                      </div>
                      {item.remark && (
                        <div className="mt-1 text-[10px] text-slate-400 line-clamp-1" title={item.remark}>
                          {item.remark}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
