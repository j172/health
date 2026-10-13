"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import { useLanguage } from "@/app/context/LanguageContext";
import type {
  AccessibleTransitRoute,
  AccessibleTransitFacility,
  AccessibleTransitHotline,
  AccessibleTransitStationMap,
  AccessibleTransitTransfer,
  TransitAccessibilityOverview,
  TransitSystemType,
} from "@/lib/server/transit/types";

type Translator = (key: string, defaultValue?: string) => string;

// Icons are locale-independent, kept as a plain lookup. Labels are built
// from `t()` inside the component (issue #486, following AedContent.tsx's
// exact pattern) since module-level constants can't be reactive to locale.
const SYSTEM_TYPE_ICONS: Record<string, string> = {
  all: "🌐",
  bus: "🚌",
  metro: "🚇",
  rail: "🚆",
  hsrail: "🚄",
  rehab_bus: "🚐",
  accessible_taxi: "🚕",
};

function getSystemTypeLabels(t: Translator): Record<string, { label: string; icon: string }> {
  return {
    all: { label: t("accessibleTransitTool.systemAll", "全部系統"), icon: SYSTEM_TYPE_ICONS.all },
    bus: { label: t("accessibleTransitTool.systemBus", "低地板公車"), icon: SYSTEM_TYPE_ICONS.bus },
    metro: { label: t("accessibleTransitTool.systemMetro", "捷運／輕軌"), icon: SYSTEM_TYPE_ICONS.metro },
    rail: { label: t("accessibleTransitTool.systemRail", "台鐵愛心服務"), icon: SYSTEM_TYPE_ICONS.rail },
    hsrail: { label: t("accessibleTransitTool.systemHsr", "台灣高鐵"), icon: SYSTEM_TYPE_ICONS.hsrail },
    rehab_bus: { label: t("accessibleTransitTool.systemRehabBus", "復康巴士專線"), icon: SYSTEM_TYPE_ICONS.rehab_bus },
    accessible_taxi: {
      label: t("accessibleTransitTool.systemAccessibleTaxi", "通用計程車"),
      icon: SYSTEM_TYPE_ICONS.accessible_taxi,
    },
  };
}

export default function AccessibleTransitContent() {
  const { t } = useLanguage();
  const systemTypeLabels = useMemo(() => getSystemTypeLabels(t), [t]);
  const [data, setData] = useState<TransitAccessibilityOverview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCounty, setSelectedCounty] = useState<string>("all");
  const [selectedSystem, setSelectedSystem] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedCounty !== "all") params.set("county", selectedCounty);
        if (selectedSystem !== "all") params.set("systemType", selectedSystem);
        if (searchQuery.trim()) params.set("query", searchQuery.trim());

        const res = await fetchWithTimeout(`/api/accessible-transit?${params.toString()}`, { timeoutMs: 5000 });
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to load transit data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedCounty, selectedSystem, searchQuery]);

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard?.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  // 篩掉已過期的設施停用公告 — 依目前時間比對 endTime（無 endTime 視為持續有效）。
  // Date.now() 只在 lazy useState initializer 內呼叫一次，避免 render 期間呼叫
  // impure function（比照 PestAlertSidebarWidget.tsx 的既有慣例）。
  const [nowTs] = useState(() => Date.now());
  const activeAlerts = useMemo(() => {
    return (data?.alerts || []).filter((a) => {
      if (a.endTime && new Date(a.endTime).getTime() < nowTs) return false;
      if (a.startTime && new Date(a.startTime).getTime() > nowTs) return false;
      return true;
    });
  }, [data?.alerts, nowTs]);

  // 以站名比對導覽圖／轉乘資料到對應的設施卡片（TDX 同步資料的 stationOrAgency
  // 即站名；舊版 seed 資料的 stationOrAgency 是機構全稱，比對不到也沒關係，單純
  // 不顯示額外資訊）。
  const mapsByStation = useMemo(() => {
    const m = new Map<string, AccessibleTransitStationMap[]>();
    for (const map of data?.stationMaps || []) {
      const list = m.get(map.stationName) || [];
      list.push(map);
      m.set(map.stationName, list);
    }
    return m;
  }, [data?.stationMaps]);

  const transfersByStation = useMemo(() => {
    const m = new Map<string, AccessibleTransitTransfer[]>();
    for (const t of data?.transfers || []) {
      const list = m.get(t.stationName) || [];
      list.push(t);
      m.set(t.stationName, list);
    }
    return m;
  }, [data?.transfers]);

  const counties = data?.counties || [
    "臺北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
    "臺中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "臺南市",
    "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣"
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* 頂部跨頁導流與標題 */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-teal-700 text-white rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-md mb-4">
            {/* issue #486: "交通部 TDX" / "衛福部" are the issuing government
                agencies' names — kept in Chinese verbatim per issue #485;
                only the surrounding generic label is translated. */}
            <span>♿ {t("accessibleTransitTool.dataSourceLabel", "通用無障礙資料來源：")}交通部 TDX ＋ 衛福部</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>{t("accessibleTransitTool.countyCoverageBadge", "22 縣市即時覆蓋")}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            {t("accessibleTransitTool.pageTitle", "全台無障礙通用交通地圖")}
          </h1>
          <p className="text-blue-100 text-base sm:text-lg leading-relaxed mb-6">
            {t(
              "accessibleTransitTool.pageDescription",
              "專為高齡長輩、輪椅朋友與推嬰兒車家長打造：快速掌握低地板公車配置比率、雙鐵捷運愛心渡板與預約、全台 22 縣市復康巴士派車中心與無障礙計程車專線。",
            )}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/tools/metro-alerts"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition backdrop-blur-sm border border-white/10"
            >
              <span>🚇</span>
              <span>{t("accessibleTransitTool.navMetroAlerts", "全台軌道營運通阻")}</span>
            </Link>
            <Link
              href="/tools/long-term-care"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition backdrop-blur-sm border border-white/10"
            >
              <span>🏥</span>
              <span>{t("accessibleTransitTool.navLongTermCare", "長照服務機構查詢")}</span>
            </Link>
            <Link
              href="/tools/disability-atm"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition backdrop-blur-sm border border-white/10"
            >
              <span>🏧</span>
              <span>{t("accessibleTransitTool.navDisabilityAtm", "無障礙 ATM 據點")}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 摘要概況卡片 */}
      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              {t("accessibleTransitTool.summaryMainRoutesLabel", "主力無障礙幹線")}
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {data.summary.totalRoutes}{" "}
              <span className="text-sm font-normal text-slate-500">{t("accessibleTransitTool.routesUnit", "條路線")}</span>
            </div>
            <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
              {t("accessibleTransitTool.allLowFloorCountTemplate", "全配比路線 {count} 條").replace(
                "{count}",
                String(data.summary.allLowFloorCount),
              )}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              {t("accessibleTransitTool.summaryAvgRatioLabel", "平均低地板比率")}
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {data.summary.avgLowFloorRatio}%
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {t("accessibleTransitTool.summaryAvgRatioSub", "每車皆設 2 席輪椅固定座")}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              {t("accessibleTransitTool.summaryRehabAgenciesLabel", "復康巴士調度處")}
            </div>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {data.summary.rehabAgenciesCount}{" "}
              <span className="text-sm font-normal text-slate-500">{t("accessibleTransitTool.countiesUnit", "個縣市")}</span>
            </div>
            <div className="mt-1 text-xs text-indigo-500">
              {t("accessibleTransitTool.summaryRehabAgenciesSub", "支援就醫預約接送")}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              {t("accessibleTransitTool.summaryBoardingReservationLabel", "雙鐵捷運渡板預約")}
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {t("accessibleTransitTool.summaryBoardingReservationValue", "全程站務導引")}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {t("accessibleTransitTool.summaryBoardingReservationSub", "抵達前專線預約免等待")}
            </div>
          </div>
        </div>
      )}

      {/* 設施停用公告 — 比照 inundation-map 的警示燈號設計語言 */}
      {activeAlerts.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚠️</span>
            <h2 className="text-sm font-bold text-orange-700 dark:text-orange-400">
              {t("accessibleTransitTool.alertsHeadingTemplate", "設施停用公告（{count} 筆生效中）").replace(
                "{count}",
                String(activeAlerts.length),
              )}
            </h2>
          </div>
          <div className="space-y-2">
            {activeAlerts.slice(0, 12).map((a) => (
              <div
                key={a.alertId}
                className="bg-white dark:bg-slate-800 rounded-lg px-4 py-2.5 text-xs border border-orange-100 dark:border-orange-900/50"
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {a.stationName}
                    {a.facilityName ? ` · ${a.facilityName}` : ""}
                  </span>
                  <span className="text-orange-600 dark:text-orange-400 font-medium whitespace-nowrap">
                    {a.reason || t("accessibleTransitTool.alertDefaultReason", "設施停用")}
                  </span>
                </div>
                {(a.startTime || a.endTime) && (
                  <div className="text-slate-500">
                    {t("accessibleTransitTool.alertPeriodLabel", "停用期間：")}
                    {a.startTime
                      ? new Date(a.startTime).toLocaleString("zh-TW")
                      : t("accessibleTransitTool.alertStartImmediate", "即刻起")}
                    {" ～ "}
                    {a.endTime
                      ? new Date(a.endTime).toLocaleString("zh-TW")
                      : t("accessibleTransitTool.alertEndPending", "恢復通知前")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 篩選與搜尋工具列 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          {/* 縣市選擇 */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-thin">
            <span className="text-xs font-bold text-slate-400 whitespace-nowrap">
              {t("accessibleTransitTool.countyLabel", "縣市：")}
            </span>
            <button
              onClick={() => setSelectedCounty("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedCounty === "all"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {t("accessibleTransitTool.allCounties", "全部縣市")}
            </button>
            {/* issue #486: county/city names (c) are government administrative
                division names — kept in Chinese verbatim per issue #485. */}
            {counties.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedCounty(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                  selectedCounty === c
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* 搜尋關鍵字 */}
          <div className="relative min-w-[220px]">
            <input
              type="text"
              placeholder={t("accessibleTransitTool.searchPlaceholder", "搜尋公車路線、醫院或電話...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2 pl-9 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
          </div>
        </div>

        {/* 系統類型 Tabs */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
          {Object.entries(systemTypeLabels).map(([key, item]) => (
            <button
              key={key}
              onClick={() => setSelectedSystem(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                selectedSystem === key
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 資料展示區 */}
      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-3 text-sm text-slate-500">
            {t("accessibleTransitTool.loadingMessage", "正在聚合各縣市無障礙交通資訊...")}
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* 1. 復康巴士專區 */}
          {(selectedSystem === "all" || selectedSystem === "rehab_bus") && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>🚐</span>
                  <span>{t("accessibleTransitTool.rehabBusHeading", "各縣市復康巴士調度與預約專線")}</span>
                </h2>
                <span className="text-xs text-slate-500">
                  {t("accessibleTransitTool.rehabBusCountTemplate", "共 {count} 處專線").replace(
                    "{count}",
                    String(data?.hotlines.length || 0),
                  )}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data?.hotlines.map((h, idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                          {h.county}
                        </span>
                        <span className="text-xs text-slate-400">{h.serviceHours}</span>
                      </div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-base mb-1">
                        {h.name}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                        {h.description}
                      </p>
                      <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg text-xs text-slate-500 dark:text-slate-400 mb-4">
                        <strong className="text-slate-700 dark:text-slate-300">
                          {t("accessibleTransitTool.eligibilityLabel", "適用資格：")}
                        </strong>
                        {h.eligibility}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                      <a
                        href={`tel:${h.phone.replace(/[^0-9]/g, "")}`}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm"
                      >
                        <span>📞</span>
                        <span>
                          {t("accessibleTransitTool.callButtonLabel", "播打電話")} {h.phone}
                        </span>
                      </a>
                      <button
                        onClick={() => handleCopyPhone(h.phone)}
                        className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-xs transition"
                        title={t("accessibleTransitTool.copyPhoneTitle", "複製電話號碼")}
                      >
                        {copiedPhone === h.phone
                          ? t("accessibleTransitTool.copiedLabel", "已複製!")
                          : t("accessibleTransitTool.copyButtonLabel", "複製")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. 軌道運輸與通用計程車無障礙設施 */}
          {(selectedSystem === "all" ||
            selectedSystem === "metro" ||
            selectedSystem === "rail" ||
            selectedSystem === "hsrail" ||
            selectedSystem === "accessible_taxi") && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>🚇</span>
                  <span>{t("accessibleTransitTool.railMetroTaxiHeading", "雙鐵、捷運與通用無障礙計程車服務")}</span>
                </h2>
                <span className="text-xs text-slate-500">
                  {t("accessibleTransitTool.facilitiesCountTemplate", "共 {count} 項設施支援").replace(
                    "{count}",
                    String(data?.facilities.length || 0),
                  )}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data?.facilities.map((f, idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mr-2">
                          {f.county}
                        </span>
                        <span className="text-xs font-medium text-slate-500">
                          {f.stationOrAgency}
                        </span>
                      </div>
                      <span className="text-lg">
                        {SYSTEM_TYPE_ICONS[f.systemType] || "♿"}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                      {f.facilityName}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                      {f.bookingRules}
                    </p>

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {f.features.map((feat, fIdx) => (
                        <span
                          key={fIdx}
                          className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                        >
                          ✓ {feat}
                        </span>
                      ))}
                    </div>

                    {f.servicePhone && (
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                          {t("accessibleTransitTool.servicePhoneLabel", "預約或客服專線：")}
                        </span>
                        <a
                          href={`tel:${f.servicePhone.replace(/[^0-9]/g, "")}`}
                          className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          📞 {f.servicePhone}
                        </a>
                      </div>
                    )}

                    {/* 導覽圖連結（有資料才顯示） */}
                    {(mapsByStation.get(f.stationOrAgency) || [])
                      .filter((m) => m.mapUrl)
                      .slice(0, 1)
                      .map((m, mIdx) => (
                        <div key={mIdx} className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700">
                          <a
                            href={m.mapUrl!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            <span>🗺️</span>
                            <span>
                              {t("accessibleTransitTool.stationMapLabel", "查看車站導覽圖")}
                              {m.mapName ? `（${m.mapName}）` : ""}
                            </span>
                          </a>
                        </div>
                      ))}

                    {/* 周邊轉乘摘要（有資料才顯示） */}
                    {(transfersByStation.get(f.stationOrAgency) || []).length > 0 && (
                      <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700">
                        <div className="text-xs text-slate-500 mb-1">
                          {t("accessibleTransitTool.nearbyTransfersLabel", "周邊轉乘：")}
                        </div>
                        <ul className="space-y-0.5">
                          {(transfersByStation.get(f.stationOrAgency) || [])
                            .slice(0, 3)
                            .map((transfer, tIdx) => (
                              <li key={tIdx} className="text-xs text-slate-600 dark:text-slate-300">
                                🔀 {transfer.transferMode || t("accessibleTransitTool.transferFallback", "轉乘")}
                                {transfer.exitName ? `（${transfer.exitName}）` : ""}
                                {transfer.transferDescription ? ` — ${transfer.transferDescription}` : ""}
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. 低地板公車主力路線 */}
          {(selectedSystem === "all" || selectedSystem === "bus") && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>🚌</span>
                  <span>{t("accessibleTransitTool.busRoutesHeading", "主力低地板公車無障礙路線")}</span>
                </h2>
                <span className="text-xs text-slate-500">
                  {t("accessibleTransitTool.busRoutesCountTemplate", "共 {count} 條推薦就醫交通路線").replace(
                    "{count}",
                    String(data?.routes.length || 0),
                  )}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data?.routes.map((r, idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                            {r.county}
                          </span>
                          {/* 真實資料 vs 示範種子資料標示 — 對應 issue #467 驗收標準「來自每日
                              同步的真實資料，不是寫死的數字」，讓使用者（與人工部署後驗證）一看
                              就能分辨這條路線是哪種來源。 */}
                          {r.source === "tdx_bus" ? (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400"
                              title={t("accessibleTransitTool.liveSyncTitle", "交通部 TDX 每日同步之真實車輛資料")}
                            >
                              {t("accessibleTransitTool.liveSyncBadge", "✓ 即時同步")}
                            </span>
                          ) : (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-400"
                              title={t("accessibleTransitTool.demoDataTitle", "尚未完成 TDX 同步，暫以示範資料顯示")}
                            >
                              {t("accessibleTransitTool.demoDataBadge", "示範資料")}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-medium text-slate-400">
                          {r.operatorName}
                        </span>
                      </div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-base mb-2">
                        {r.routeName}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                        {r.description}
                      </p>

                      {/* 班次層級低地板標示 — issue #467「可以看到某條路線某個班次是否為
                          低地板車」，資料來自 TDX Bus/Schedule 的 Timetable.IsLowFloor 取樣。 */}
                      {r.sampleTrips && r.sampleTrips.length > 0 && (
                        <div className="mb-4">
                          <div className="text-xs text-slate-500 mb-1.5">
                            {t("accessibleTransitTool.tripLowFloorLabel", "班次低地板標示：")}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {r.sampleTrips.map((trip, tIdx) => (
                              <span
                                key={trip.tripId || tIdx}
                                className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                  trip.isLowFloor
                                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
                                    : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                                }`}
                                title={
                                  trip.isLowFloor
                                    ? t("accessibleTransitTool.tripIsLowFloorTitle", "此班次為低地板車")
                                    : t("accessibleTransitTool.tripNotLowFloorTitle", "此班次非低地板車")
                                }
                              >
                                {trip.isLowFloor ? "♿" : "🚫"}{" "}
                                {trip.departureTime
                                  ? trip.departureTime.slice(0, 5)
                                  : t("accessibleTransitTool.tripFallbackTemplate", "班次 {idx}").replace(
                                      "{idx}",
                                      String(tIdx + 1),
                                    )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="mb-2">
                        <div className="flex items-center justify-between text-xs font-medium mb-1">
                          <span className="text-slate-500">
                            {t("accessibleTransitTool.lowFloorRatioLabel", "低地板車隊比率")}
                          </span>
                          <span
                            className={
                              r.lowFloorRatio >= 95
                                ? "text-emerald-600 font-bold"
                                : "text-blue-600 font-bold"
                            }
                          >
                            {r.lowFloorRatio}%
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              r.lowFloorRatio >= 95 ? "bg-emerald-500" : "bg-blue-500"
                            }`}
                            style={{ width: `${r.lowFloorRatio}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-700">
                        <span>
                          {t("accessibleTransitTool.wheelchairSlotsTemplate", "輪椅席位：{n} 席/車").replace(
                            "{n}",
                            String(r.wheelchairSlots),
                          )}
                        </span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          {r.isAllLowFloor
                            ? t("accessibleTransitTool.allLowFloorBadge", "★ 全低地板班次")
                            : t("accessibleTransitTool.highRatioLowFloorBadge", "高比例低地板")}
                        </span>
                      </div>
                    </div>
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
