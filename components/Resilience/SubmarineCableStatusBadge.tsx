"use client";

import { useEffect, useState } from "react";
import type {
  CableHealthStatus,
  SubmarineCableStatusResponse,
} from "@/lib/server/resilience/submarineCableService";

export interface SubmarineCableStatusBadgeProps {
  initialData?: SubmarineCableStatusResponse | null;
  locale?: string;
  className?: string;
}

const DEFAULT_FALLBACK: SubmarineCableStatusResponse = {
  status: "NORMAL",
  statusLabel: "國際與離島海底通訊電纜運作正常，對外網路頻寬維持常態水準。",
  activeIncidentsCount: 0,
  incidents: [],
  updatedAt: new Date().toISOString(),
};

export default function SubmarineCableStatusBadge({
  initialData,
  locale = "zh",
  className = "",
}: SubmarineCableStatusBadgeProps) {
  const [data, setData] = useState<SubmarineCableStatusResponse>(
    initialData ?? DEFAULT_FALLBACK,
  );
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
      return;
    }

    let active = true;
    fetch("/api/submarine-cables/status")
      .then((res) => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then((body) => {
        if (active && body?.success && body?.data) {
          setData(body.data);
        }
      })
      .catch(() => {
        // keep fallback default
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [initialData]);

  const isEn = locale === "en";
  const isJa = locale === "ja";
  const isKo = locale === "ko";

  const title = isEn
    ? "Submarine Cable Resilience Status"
    : isJa
    ? "海底ケーブル通信レジリエンス状態"
    : isKo
    ? "해저 케이블 통신 복원력 상태"
    : "臺灣對外海纜通訊韌性狀態";

  const debunkText = isEn
    ? "Experiencing network connectivity drops? Verify physical submarine cable outages on 【Taiwan Submarine Cable Map】"
    : isJa
    ? "ネット接続の異常時は【台湾海底ケーブル動態マップ】で物理障害を確認できます"
    : isKo
    ? "인터넷 연결 이상 발생 시 【대만 해저 케이블 동태 지도】에서 물리적 해저 케이블 장애를 확인하세요"
    : "若遇網路連線異常，可至【台灣海纜動態地圖】查核實體海纜障礙";

  const statusMap: Record<
    CableHealthStatus,
    {
      badgeText: string;
      dotColor: string;
      cardBorder: string;
      cardBg: string;
      pillStyle: string;
    }
  > = {
    NORMAL: {
      badgeText: isEn
        ? "🟢 Normal"
        : isJa
        ? "🟢 正常"
        : isKo
        ? "🟢 정상"
        : "🟢 正常運作",
      dotColor: "bg-emerald-500",
      cardBorder: "border-emerald-200/80 dark:border-emerald-900/50",
      cardBg:
        "bg-gradient-to-br from-emerald-50/60 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/20",
      pillStyle:
        "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
    },
    DEGRADED: {
      badgeText: isEn
        ? "🟡 Degraded"
        : isJa
        ? "🟡 一部障害"
        : isKo
        ? "🟡 부분 장애"
        : "🟡 局部障礙維修中",
      dotColor: "bg-amber-500",
      cardBorder: "border-amber-200/80 dark:border-amber-900/50",
      cardBg:
        "bg-gradient-to-br from-amber-50/60 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-amber-950/20",
      pillStyle:
        "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    },
    CRITICAL: {
      badgeText: isEn
        ? "🔴 Critical"
        : isJa
        ? "🔴 重大障害"
        : isKo
        ? "🔴 중대 중단"
        : "🔴 嚴重中斷警戒",
      dotColor: "bg-rose-500",
      cardBorder: "border-rose-200/80 dark:border-rose-900/50",
      cardBg:
        "bg-gradient-to-br from-rose-50/60 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-rose-950/20",
      pillStyle:
        "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
    },
  };

  const currentStatusConfig = statusMap[data.status] || statusMap.NORMAL;

  const countBadgeText =
    data.activeIncidentsCount === 0
      ? isEn
        ? "0 Active Incidents"
        : isJa
        ? "障害件数 0 件"
        : isKo
        ? "활성 장애 0건"
        : "0 處海纜障礙"
      : isEn
      ? `${data.activeIncidentsCount} Active Incident${data.activeIncidentsCount > 1 ? "s" : ""}`
      : isJa
      ? `${data.activeIncidentsCount} 件修復中`
      : isKo
      ? `${data.activeIncidentsCount}건 복구 중`
      : `${data.activeIncidentsCount} 處障礙修復中`;

  const activeIncidents = data.incidents.filter(
    (inc) => inc.status === "active" || inc.status === "repairing",
  );

  return (
    <section
      className={`my-6 rounded-2xl border p-5 shadow-xs transition-all ${currentStatusConfig.cardBorder} ${currentStatusConfig.cardBg} ${className}`}
      aria-label={title}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden="true">
            🌐
          </span>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border font-semibold ${currentStatusConfig.pillStyle}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${currentStatusConfig.dotColor} ${
                loading ? "animate-pulse" : ""
              }`}
            />
            <span>{currentStatusConfig.badgeText}</span>
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-medium">
            {countBadgeText}
          </span>
        </div>
      </div>

      <p className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300 mb-3">
        {data.statusLabel}
      </p>

      {activeIncidents.length > 0 && (
        <div className="mb-3 space-y-1.5 rounded-xl bg-white/70 p-3 border border-slate-200/80 dark:bg-slate-850 dark:border-slate-800 text-xs">
          {activeIncidents.map((inc) => (
            <div
              key={inc.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-slate-600 dark:text-slate-400"
            >
              <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                <span className="text-amber-500">⚠️</span>
                <span>{inc.cable_name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-normal">
                  {inc.incident_type === "cut"
                    ? "斷纜"
                    : inc.incident_type === "maintenance"
                    ? "維護"
                    : "障礙"}
                </span>
              </div>
              {inc.impact_summary && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-md">
                  {inc.impact_summary}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Contextual debunking guide linking to smc.peering.tw */}
      <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <a
          href="https://smc.peering.tw/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-semibold transition"
        >
          <span>{debunkText}</span>
          <span aria-hidden="true">↗</span>
          <span className="sr-only">（另開新視窗）</span>
        </a>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          資料來源：smc.peering.tw
        </span>
      </div>
    </section>
  );
}
