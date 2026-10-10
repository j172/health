"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import type { SeniorFriendlyOverview } from "@/lib/server/seniorTourism/types";

export default function SeniorFriendlyContent() {
  const [data, setData] = useState<SeniorFriendlyOverview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCounty, setSelectedCounty] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedCounty !== "all") params.set("county", selectedCounty);
        if (searchQuery.trim()) params.set("query", searchQuery.trim());

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
  }, [selectedCounty, searchQuery]);

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard?.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  // 篩掉已過期的景區設施停用公告 — 依目前時間比對 endTime（無 endTime 視為持續
  // 有效）。Date.now() 只在 lazy useState initializer 內呼叫一次，避免 render
  // 期間呼叫 impure function（比照 AccessibleTransitContent.tsx 的既有慣例）。
  const [nowTs] = useState(() => Date.now());
  const activeAlerts = useMemo(() => {
    return (data?.tourismAlerts || []).filter((a) => {
      if (a.endTime && new Date(a.endTime).getTime() < nowTs) return false;
      if (a.startTime && new Date(a.startTime).getTime() > nowTs) return false;
      return true;
    });
  }, [data?.tourismAlerts, nowTs]);

  // 以景點名稱將服務（軟性服務）歸納到對應的設施卡片下方一起顯示。
  const servicesByAttraction = useMemo(() => {
    const m = new Map<string, NonNullable<SeniorFriendlyOverview["tourismServices"]>>();
    for (const s of data?.tourismServices || []) {
      const list = m.get(s.attractionName) || [];
      list.push(s);
      m.set(s.attractionName, list);
    }
    return m;
  }, [data?.tourismServices]);

  const facilitiesByAttraction = useMemo(() => {
    const m = new Map<string, { county: string | null; items: NonNullable<SeniorFriendlyOverview["tourismFacilities"]> }>();
    for (const f of data?.tourismFacilities || []) {
      const existing = m.get(f.attractionName);
      if (existing) {
        existing.items.push(f);
      } else {
        m.set(f.attractionName, { county: f.county, items: [f] });
      }
    }
    return m;
  }, [data?.tourismFacilities]);

  const attractionNames = Array.from(
    new Set([...facilitiesByAttraction.keys(), ...servicesByAttraction.keys()]),
  );

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
            <span>🧓 交通部 TDX 樂齡/敬老開放資料</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>22 縣市敬老卡</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            敬老卡補助與樂齡旅遊地圖
          </h1>
          <p className="text-amber-100 text-base sm:text-lg leading-relaxed mb-6">
            查詢全臺 22 縣市敬老卡交通補助，搭配景區無障礙設施、軟性服務與樂齡套票推薦，陪長輩安心出遊。
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
              href="/tools/elder-welfare"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition backdrop-blur-sm border border-white/10"
            >
              <span>🏡</span>
              <span>老人福利機構查詢</span>
            </Link>
            <Link
              href="/tools/ltc-contracted"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition backdrop-blur-sm border border-white/10"
            >
              <span>🏥</span>
              <span>長照服務機構查詢</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 縣市選擇（敬老卡查詢用，同時套用到下方搜尋） */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
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

          <div className="relative min-w-[220px]">
            <input
              type="text"
              placeholder="搜尋景點或服務名稱..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2 pl-9 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-3 text-sm text-slate-500">正在查詢敬老卡與樂齡觀光資訊...</p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* 1. 敬老卡查詢 */}
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
                          href={card.infoUrl}
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

          {/* 2. 觀光景區無障礙設施/服務 */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>🏞️</span>
                <span>景區無障礙設施與軟性服務</span>
              </h2>
              <span className="text-xs text-slate-500">共 {attractionNames.length} 處景點</span>
            </div>
            {attractionNames.length === 0 ? (
              <p className="text-sm text-slate-500 bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-100 dark:border-slate-700">
                找不到符合條件的景區資料，請調整搜尋關鍵字。
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {attractionNames.map((name) => {
                  const facility = facilitiesByAttraction.get(name);
                  const services = servicesByAttraction.get(name) || [];
                  const county = facility?.county || services[0]?.county;
                  return (
                    <div
                      key={name}
                      className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">{name}</h3>
                        {county && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {county}
                          </span>
                        )}
                      </div>

                      {facility && facility.items.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {facility.items.map((item, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                              title={item.description || undefined}
                            >
                              ✓ {item.facilityName || item.category}
                            </span>
                          ))}
                        </div>
                      )}

                      {services.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                          {services.map((s, idx) => (
                            <div key={idx} className="text-xs">
                              <div className="font-medium text-slate-800 dark:text-slate-100">
                                {s.serviceName}
                              </div>
                              {s.description && (
                                <p className="text-slate-500 dark:text-slate-400 mb-1">{s.description}</p>
                              )}
                              {s.servicePhone && (
                                <div className="flex items-center gap-2">
                                  <a
                                    href={`tel:${s.servicePhone.replace(/[^0-9]/g, "")}`}
                                    className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    <span>📞</span>
                                    <span>{s.servicePhone}</span>
                                  </a>
                                  <button
                                    onClick={() => handleCopyPhone(s.servicePhone!)}
                                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-[11px] transition"
                                  >
                                    {copiedPhone === s.servicePhone ? "已複製!" : "複製"}
                                  </button>
                                </div>
                              )}
                              {s.serviceUrl && (
                                <a
                                  href={s.serviceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                  <span>🔗</span>
                                  <span>服務網站</span>
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. 樂齡套票推薦 */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>🎫</span>
                <span>樂齡套票推薦</span>
              </h2>
              <span className="text-xs text-slate-500">共 {data?.tourPackages.length || 0} 項套票</span>
            </div>
            {(data?.tourPackages.length || 0) === 0 ? (
              <p className="text-sm text-slate-500 bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-100 dark:border-slate-700">
                目前沒有符合條件的樂齡套票。
              </p>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
                {data?.tourPackages.map((p, idx) => (
                  <div
                    key={idx}
                    className="min-w-[260px] max-w-[280px] flex-shrink-0 bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-base mb-2">{p.packageName}</h3>
                      {p.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                          {p.description}
                        </p>
                      )}
                      {p.issuingEntity && (
                        <p className="text-xs text-slate-400 mb-3">發行單位：{p.issuingEntity}</p>
                      )}
                    </div>
                    {p.bookingUrl && (
                      <a
                        href={p.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm"
                      >
                        <span>🎟️</span>
                        <span>前往購票</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. 景區設施停用公告 — 比照 AccessibleTransitContent.tsx 的警示橫幅風格 */}
          {activeAlerts.length > 0 && (
            <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">⚠️</span>
                <h2 className="text-sm font-bold text-orange-700 dark:text-orange-400">
                  景區設施停用公告（{activeAlerts.length} 筆生效中）
                </h2>
              </div>
              <div className="space-y-2">
                {activeAlerts.slice(0, 12).map((a) => (
                  <div
                    key={a.alertId}
                    className="bg-white dark:bg-slate-800 rounded-lg px-4 py-2.5 text-xs border border-orange-100 dark:border-orange-900/50"
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-bold text-slate-900 dark:text-white">{a.targetName}</span>
                      <span className="text-orange-600 dark:text-orange-400 font-medium whitespace-nowrap">
                        {a.reason || "設施停用"}
                      </span>
                    </div>
                    {(a.startTime || a.endTime) && (
                      <div className="text-slate-500">
                        停用期間：{a.startTime ? new Date(a.startTime).toLocaleString("zh-TW") : "即刻起"}
                        {" ～ "}
                        {a.endTime ? new Date(a.endTime).toLocaleString("zh-TW") : "恢復通知前"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
