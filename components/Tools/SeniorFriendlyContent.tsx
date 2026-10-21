"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import type { SeniorCardOverview } from "@/lib/server/seniorCard/types";

export default function SeniorFriendlyContent() {
  const [data, setData] = useState<SeniorCardOverview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCounty, setSelectedCounty] = useState<string>("all");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedCounty !== "all") params.set("county", selectedCounty);

        const res = await fetchWithTimeout(`/api/senior-friendly?${params.toString()}`, { timeoutMs: 5000 });
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to load senior-friendly data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedCounty]);

  const counties = data?.counties || [
    "臺北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
    "臺中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "臺南市",
    "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣",
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* 頂部跨頁導流與標題 */}
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-md mb-4">
            <span>🪪 各縣市社會局敬老福利政策</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>22 縣市敬老卡</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            敬老卡補助
          </h1>
          <p className="text-amber-100 text-base sm:text-lg leading-relaxed mb-6">
            查詢全臺 22 縣市敬老卡交通補助與申請資訊。補助額度與資格各縣市不同且會調整，實際內容請以當地社會局（處）最新公告為準。
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/tools/accessible-transit"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition backdrop-blur-sm border border-white/10"
            >
              <span>♿</span>
              <span>全台無障礙交通地圖</span>
            </Link>
            <Link
              href="/tools/long-term-care?type=elder-welfare"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition backdrop-blur-sm border border-white/10"
            >
              <span>🏡</span>
              <span>老人福利機構查詢</span>
            </Link>
            <Link
              href="/tools/long-term-care"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition backdrop-blur-sm border border-white/10"
            >
              <span>🏥</span>
              <span>長照照顧圈地圖</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 縣市選擇 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-thin">
          <span className="text-xs font-bold text-slate-400 whitespace-nowrap">縣市：</span>
          <button
            onClick={() => setSelectedCounty("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
              selectedCounty === "all"
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            全部縣市
          </button>
          {counties.map((c) => (
            <button
              key={c}
              onClick={() => setSelectedCounty(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedCounty === c
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-3 text-sm text-slate-500">正在查詢敬老卡補助資訊...</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>🪪</span>
              <span>敬老卡交通補助查詢</span>
            </h2>
            <span className="text-xs text-slate-500">共 {data?.seniorCards.length || 0} 縣市資料</span>
          </div>
          {(data?.seniorCards.length || 0) === 0 ? (
            <p className="text-sm text-slate-500 bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-100 dark:border-slate-700">
              找不到符合條件的敬老卡資料，請選擇其他縣市。
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data?.seniorCards.map((card, idx) => (
                <div
                  key={idx}
                  className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                        {card.county}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base mb-2">
                      {card.cardName || "敬老卡"}
                    </h3>
                    <ul className="space-y-1.5 mb-4">
                      {card.subsidies.map((s, sIdx) => (
                        <li key={sIdx} className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {s.category && (
                            <span className="font-medium text-slate-800 dark:text-slate-100">{s.category}：</span>
                          )}
                          {s.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {card.infoUrl && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
                      <a
                        href={appendOutboundUtm(card.infoUrl, {
                          medium: "tool_outbound",
                          campaign: "senior_friendly",
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-sm"
                      >
                        <span>🔗</span>
                        <span>查看說明網站</span>
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
