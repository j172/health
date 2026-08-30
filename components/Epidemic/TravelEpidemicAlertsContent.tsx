"use client";

import { useEffect, useState, useMemo } from "react";
import type { CDCTravelAlertItem, CDCEpidemicNewsItem } from "@/app/api/cdc/travel-alerts/route";

export default function TravelEpidemicAlertsContent() {
  const [alerts, setAlerts] = useState<CDCTravelAlertItem[]>([]);
  const [news, setNews] = useState<CDCEpidemicNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"alerts" | "news">("alerts");
  const [keyword, setKeyword] = useState("");
  const [levelFilter, setLevelFilter] = useState<number | 0>(0); // 0 = all, 3 = warning, 2 = alert, 1 = watch

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        const res = await fetch("/api/cdc/travel-alerts");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "載入失敗");
        if (!ignore) {
          setAlerts(json.alerts || []);
          setNews(json.news || json.epidemicNews || []);
          setError(null);
        }
      } catch (err: any) {
        if (!ignore) {
          setError(err.message || "無法連線至疾管署國際疫情資料庫");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    loadData();
    return () => {
      ignore = true;
    };
  }, []);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    fetch("/api/cdc/travel-alerts")
      .then((res) => res.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error || "載入失敗");
        setAlerts(json.alerts || []);
        setNews(json.news || json.epidemicNews || []);
      })
      .catch((err) => setError(err.message || "載入失敗"))
      .finally(() => setLoading(false));
  };

  const stats = useMemo(() => {
    const level3 = alerts.filter((a) => a.levelCode === 3).length;
    const level2 = alerts.filter((a) => a.levelCode === 2).length;
    const level1 = alerts.filter((a) => a.levelCode === 1).length;
    return { level3, level2, level1, total: alerts.length };
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (levelFilter > 0 && a.levelCode !== levelFilter) return false;
      if (keyword.trim()) {
        const kw = keyword.toLowerCase().trim();
        const matchCountry = a.country.toLowerCase().includes(kw) || a.countryEn.toLowerCase().includes(kw);
        const matchDisease = a.disease.toLowerCase().includes(kw);
        const matchInstruction = a.instruction.toLowerCase().includes(kw);
        if (!matchCountry && !matchDisease && !matchInstruction) return false;
      }
      return true;
    });
  }, [alerts, levelFilter, keyword]);

  const filteredNews = useMemo(() => {
    return news.filter((n) => {
      if (keyword.trim()) {
        const kw = keyword.toLowerCase().trim();
        const matchHeadline = n.headline.toLowerCase().includes(kw);
        const matchDesc = n.description.toLowerCase().includes(kw);
        const matchCountry = n.country.toLowerCase().includes(kw) || n.countryEn.toLowerCase().includes(kw);
        const matchDisease = n.disease.toLowerCase().includes(kw);
        if (!matchHeadline && !matchDesc && !matchCountry && !matchDisease) return false;
      }
      return true;
    });
  }, [news, keyword]);

  const getLevelBadge = (levelCode: number, severityLevel: string) => {
    if (levelCode === 3) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800 dark:bg-rose-950/70 dark:text-rose-300">
          🔴 第三級：警告 (Warning)
        </span>
      );
    }
    if (levelCode === 2) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
          🟠 第二級：警示 (Alert)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
        🟡 第一級：注意 (Watch)
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            setActiveTab("alerts");
            setLevelFilter(0);
          }}
          className={`rounded-2xl border p-4 text-left transition-all ${
            levelFilter === 0 && activeTab === "alerts"
              ? "border-indigo-500 bg-indigo-50/50 shadow-xs dark:border-indigo-500 dark:bg-indigo-950/30"
              : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
          }`}
        >
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">各國旅遊警示總數</div>
          <div className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-slate-100">{stats.total}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">涵蓋全球疾管署監測國</div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("alerts");
            setLevelFilter(3);
          }}
          className={`rounded-2xl border p-4 text-left transition-all ${
            levelFilter === 3 && activeTab === "alerts"
              ? "border-rose-500 bg-rose-50/60 shadow-xs dark:border-rose-500 dark:bg-rose-950/40"
              : "border-slate-200 bg-white hover:border-rose-300 dark:border-slate-800 dark:bg-slate-900"
          }`}
        >
          <div className="text-xs font-semibold text-rose-600 dark:text-rose-400">🔴 第三級 警告</div>
          <div className="mt-1 text-2xl font-extrabold text-rose-700 dark:text-rose-300">{stats.level3}</div>
          <div className="mt-0.5 text-[11px] text-rose-500/80">避免所有非必要旅遊</div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("alerts");
            setLevelFilter(2);
          }}
          className={`rounded-2xl border p-4 text-left transition-all ${
            levelFilter === 2 && activeTab === "alerts"
              ? "border-amber-500 bg-amber-50/60 shadow-xs dark:border-amber-500 dark:bg-amber-950/40"
              : "border-slate-200 bg-white hover:border-amber-300 dark:border-slate-800 dark:bg-slate-900"
          }`}
        >
          <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">🟠 第二級 警示</div>
          <div className="mt-1 text-2xl font-extrabold text-amber-700 dark:text-amber-300">{stats.level2}</div>
          <div className="mt-0.5 text-[11px] text-amber-600/80">對當地採取加強防護</div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("alerts");
            setLevelFilter(1);
          }}
          className={`rounded-2xl border p-4 text-left transition-all ${
            levelFilter === 1 && activeTab === "alerts"
              ? "border-emerald-500 bg-emerald-50/60 shadow-xs dark:border-emerald-500 dark:bg-emerald-950/40"
              : "border-slate-200 bg-white hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900"
          }`}
        >
          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">🟡 第一級 注意</div>
          <div className="mt-1 text-2xl font-extrabold text-emerald-700 dark:text-emerald-300">{stats.level1}</div>
          <div className="mt-0.5 text-[11px] text-emerald-600/80">遵守當地一般預防措施</div>
        </button>
      </div>

      {/* Main Panel */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        {/* Tab switcher + Search Bar */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            {/* Dual Tabs */}
            <div className="flex rounded-xl border border-slate-200 bg-slate-100/70 p-1 dark:border-slate-800 dark:bg-slate-800/80">
              <button
                type="button"
                onClick={() => setActiveTab("alerts")}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                  activeTab === "alerts"
                    ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-700 dark:text-indigo-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                🌍 旅遊疫情建議等級 ({alerts.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("news")}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                  activeTab === "news"
                    ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-700 dark:text-indigo-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                📰 國際重要疫情快訊 ({news.length})
              </button>
            </div>

            {/* Source info */}
            <div className="text-xs text-slate-400">
              資料來源：衛福部疾病管制署 (Taiwan CDC)
            </div>
          </div>

          {/* Search input and level pill filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜尋國家（中英文如 Japan, 泰國）或疾病名稱（登革熱、麻疹、屈公病）..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder-slate-500"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  清除
                </button>
              )}
            </div>

            {activeTab === "alerts" && (
              <div className="flex items-center gap-1.5">
                {[
                  { label: "全部", val: 0 },
                  { label: "三級警告", val: 3 },
                  { label: "二級警示", val: 2 },
                  { label: "一級注意", val: 1 },
                ].map((btn) => (
                  <button
                    key={btn.val}
                    type="button"
                    onClick={() => setLevelFilter(btn.val)}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                      levelFilter === btn.val
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="h-5 w-1/3 rounded-md bg-slate-200 dark:bg-slate-800" />
              <div className="mt-3 h-4 w-2/3 rounded-md bg-slate-200 dark:bg-slate-800" />
              <div className="mt-4 h-16 w-full rounded-xl bg-slate-100 dark:bg-slate-800/60" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-6 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
          <p className="text-sm font-medium text-rose-800 dark:text-rose-300">{error}</p>
          <button
            onClick={handleRetry}
            className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-500"
          >
            重新載入
          </button>
        </div>
      )}

      {/* Tab 1: Travel Alerts Cards */}
      {!loading && !error && activeTab === "alerts" && (
        <>
          {filteredAlerts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
              <span className="text-4xl">🌴</span>
              <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">查無符合條件的旅遊疫情警示</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">可嘗試更換關鍵字或切換警示等級篩選。</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAlerts.map((item) => (
                <div
                  key={item.id}
                  className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700/60"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                          {item.country} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{item.countryEn}</span>
                        </h3>
                        <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                          🦠 警示疾病：{item.disease}
                        </div>
                      </div>
                      {getLevelBadge(item.levelCode, item.severityLevel)}
                    </div>

                    <div className="mt-3.5 rounded-xl bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">🛡️ 衛福防護指引：</div>
                      <p className="mt-1 leading-relaxed">{item.instruction || "提醒遵守當地一般預防措施，注意飲食與防蚊衛生。"}</p>
                    </div>

                    <div className="mt-3 text-[11px] text-slate-400">
                      生效發布日期：{item.effective?.slice(0, 10) || "最新公告"}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    {item.lat !== null && item.lng !== null && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750"
                      >
                        📍 地圖位置
                      </a>
                    )}
                    <a
                      href={item.web || "https://www.cdc.gov.tw"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-xl bg-indigo-600 px-3 py-2 text-center text-xs font-semibold text-white shadow-xs transition-colors hover:bg-indigo-500"
                    >
                      疾管署說明 ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab 2: Epidemic News Cards */}
      {!loading && !error && activeTab === "news" && (
        <>
          {filteredNews.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
              <span className="text-4xl">📰</span>
              <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">查無相關重要疫情快訊</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">可嘗試更換關鍵字搜尋。</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredNews.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700/60"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950/70 dark:text-rose-300">
                        {item.disease || "重大疫情"}
                      </span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        📍 {item.country} {item.countryEn && `(${item.countryEn})`}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-slate-400">
                      發布時間：{item.sent?.slice(0, 10) || item.effective?.slice(0, 10)}
                    </span>
                  </div>

                  <h3 className="mt-2 text-base font-bold text-slate-900 dark:text-slate-100">
                    {item.headline}
                  </h3>

                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line">
                    {item.description}
                  </p>

                  <div className="mt-4 flex items-center justify-end">
                    <a
                      href={item.web || "https://www.cdc.gov.tw"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                    >
                      疾管署完整通報報告 ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
