import React from "react";

interface WaterLevelStaffGaugeProps {
  waterLevel: number | null;
  alertLevel1: number | null;
  alertLevel2: number | null;
  alertLevel3: number | null;
  className?: string;
}

export type AlertStatus = "level1" | "level2" | "level3" | "normal" | "unknown";

export function getAlertStatus(
  waterLevel: number | null,
  alert1: number | null,
  alert2: number | null,
  alert3: number | null,
): { status: AlertStatus; label: string; badgeClass: string; color: string } {
  if (waterLevel === null) {
    return {
      status: "unknown",
      label: "未觀測",
      badgeClass: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
      color: "#94a3b8",
    };
  }

  // Level 1: Red (most severe)
  if (alert1 !== null && waterLevel >= alert1) {
    return {
      status: "level1",
      label: "🚨 一級警戒",
      badgeClass:
        "bg-red-500 text-white font-semibold animate-pulse shadow-sm shadow-red-500/50",
      color: "#ef4444",
    };
  }

  // Level 2: Orange
  if (alert2 !== null && waterLevel >= alert2) {
    return {
      status: "level2",
      label: "⚠️ 二級警戒",
      badgeClass:
        "bg-orange-500 text-white font-semibold shadow-sm shadow-orange-500/40",
      color: "#f97316",
    };
  }

  // Level 3: Amber / Yellow
  if (alert3 !== null && waterLevel >= alert3) {
    return {
      status: "level3",
      label: "⚡ 三級警戒",
      badgeClass:
        "bg-amber-400 text-amber-950 font-semibold shadow-sm shadow-amber-400/40",
      color: "#f59e0b",
    };
  }

  // Normal: when alert levels are defined and water level is below
  if (alert1 !== null || alert2 !== null || alert3 !== null) {
    return {
      status: "normal",
      label: "正常",
      badgeClass:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
      color: "#10b981",
    };
  }

  return {
    status: "unknown",
    label: "未設警戒",
    badgeClass: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    color: "#0ea5e9",
  };
}

/**
 * Fancy SVG Staff Gauge (防汛水尺規) with alert thresholds and water fill line.
 */
export default function WaterLevelStaffGauge({
  waterLevel,
  alertLevel1,
  alertLevel2,
  alertLevel3,
  className = "",
}: WaterLevelStaffGaugeProps) {
  const alertInfo = getAlertStatus(waterLevel, alertLevel1, alertLevel2, alertLevel3);

  // Compute a normalized coordinate scale for the staff ruler
  // We want the gauge to show zero up to max(alert1 * 1.15, waterLevel * 1.15, 5m)
  const maxRef = Math.max(
    alertLevel1 ?? 0,
    alertLevel2 ?? 0,
    alertLevel3 ?? 0,
    waterLevel ?? 0,
    3,
  );
  const scaleMax = maxRef > 0 ? maxRef * 1.15 : 10;

  const width = 110;
  const height = 40;
  const rulerX = 6;
  const rulerWidth = width - 12;

  // Convert water level to horizontal bar width
  const getX = (val: number | null) => {
    if (val === null || val <= 0) return rulerX;
    const ratio = Math.min(1, Math.max(0, val / scaleMax));
    return rulerX + ratio * rulerWidth;
  };

  const currentX = getX(waterLevel);
  const a3X = alertLevel3 !== null ? getX(alertLevel3) : null;
  const a2X = alertLevel2 !== null ? getX(alertLevel2) : null;
  const a1X = alertLevel1 !== null ? getX(alertLevel1) : null;

  return (
    <div className={`inline-flex flex-col gap-1 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
          {waterLevel !== null ? `${waterLevel.toFixed(2)} m` : "—"}
        </span>
        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${alertInfo.badgeClass}`}>
          {alertInfo.label}
        </span>
      </div>

      <div className="relative" style={{ width, height: 26 }}>
        <svg
          viewBox={`0 0 ${width} 26`}
          className="h-full w-full overflow-visible"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="waterFlow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="70%" stopColor="#0284c7" />
              <stop offset="100%" stopColor={alertInfo.color} />
            </linearGradient>
            <linearGradient id="staffRulerBg" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </linearGradient>
          </defs>

          {/* Staff ruler track */}
          <rect
            x={rulerX}
            y={5}
            width={rulerWidth}
            height={16}
            rx={4}
            className="fill-slate-100 dark:fill-slate-800 stroke-slate-300 dark:stroke-slate-700"
            strokeWidth="1"
          />

          {/* Ruler subdivisions */}
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
            <line
              key={ratio}
              x1={rulerX + rulerWidth * ratio}
              y1={5}
              x2={rulerX + rulerWidth * ratio}
              y2={9}
              stroke="#94a3b8"
              strokeWidth="0.8"
            />
          ))}

          {/* Current Water Level fill */}
          {waterLevel !== null && currentX > rulerX && (
            <rect
              x={rulerX + 1}
              y={6}
              width={Math.max(2, currentX - rulerX - 1)}
              height={14}
              rx={3}
              fill="url(#waterFlow)"
              className="opacity-85 transition-all duration-500 ease-out"
            />
          )}

          {/* Alert level indicator marks */}
          {a3X !== null && (
            <g>
              <line
                x1={a3X}
                y1={3}
                x2={a3X}
                y2={23}
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="2,1"
              />
              <circle cx={a3X} cy={3} r="1.5" fill="#f59e0b" />
            </g>
          )}

          {a2X !== null && (
            <g>
              <line
                x1={a2X}
                y1={3}
                x2={a2X}
                y2={23}
                stroke="#f97316"
                strokeWidth="1.5"
                strokeDasharray="2,1"
              />
              <circle cx={a2X} cy={3} r="1.5" fill="#f97316" />
            </g>
          )}

          {a1X !== null && (
            <g>
              <line
                x1={a1X}
                y1={2}
                x2={a1X}
                y2={24}
                stroke="#ef4444"
                strokeWidth="2"
              />
              <circle cx={a1X} cy={2} r="2" fill="#ef4444" />
            </g>
          )}

          {/* Current Water level needle / crest marker */}
          {waterLevel !== null && (
            <line
              x1={currentX}
              y1={4}
              x2={currentX}
              y2={22}
              stroke="#ffffff"
              strokeWidth="2"
            />
          )}
        </svg>
      </div>

      {/* Alert levels summary indicator */}
      {(alertLevel1 !== null || alertLevel2 !== null || alertLevel3 !== null) && (
        <div className="flex gap-2 text-[10px] text-slate-500 dark:text-slate-400">
          {alertLevel3 !== null && (
            <span className="text-amber-600 dark:text-amber-400">三級:{alertLevel3}m</span>
          )}
          {alertLevel2 !== null && (
            <span className="text-orange-600 dark:text-orange-400">二級:{alertLevel2}m</span>
          )}
          {alertLevel1 !== null && (
            <span className="text-red-600 dark:text-red-400">一級:{alertLevel1}m</span>
          )}
        </div>
      )}
    </div>
  );
}
