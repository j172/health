import React from "react";

interface ReservoirWaterTankGaugeProps {
  waterLevel: number | null;
  effectiveCapacity: number | null;
  className?: string;
}

/**
 * Fancy SVG visualization of a reservoir water tank with liquid gradients,
 * realistic glass reflection, and wave surface.
 */
export default function ReservoirWaterTankGauge({
  waterLevel,
  effectiveCapacity,
  className = "",
}: ReservoirWaterTankGaugeProps) {
  // Approximate a visual fill percentage (normalized heuristic when max capacity isn't known)
  // Large reservoirs range around 50~250m water level or 0~40,000 萬m³
  let fillPercent = 50;
  if (waterLevel !== null && waterLevel > 0) {
    if (waterLevel <= 30) {
      fillPercent = Math.min(85, Math.max(15, (waterLevel / 30) * 85));
    } else if (waterLevel <= 100) {
      fillPercent = Math.min(90, Math.max(20, (waterLevel / 100) * 90));
    } else if (waterLevel <= 250) {
      fillPercent = Math.min(95, Math.max(25, (waterLevel / 250) * 95));
    } else {
      fillPercent = 75;
    }
  }

  // Dimensions of SVG tank
  const width = 120;
  const height = 48;
  const tankRadius = 8;
  const fillWidth = Math.max(8, Math.min(width, (fillPercent / 100) * width));

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <div className="relative shrink-0" style={{ width, height }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full drop-shadow-sm overflow-hidden rounded-lg"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Background container gradient */}
            <linearGradient id="tankBg" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f1f5f9" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.9" />
            </linearGradient>

            {/* Dark mode container gradient */}
            <linearGradient id="tankBgDark" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1e293b" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.8" />
            </linearGradient>

            {/* Liquid water gradient */}
            <linearGradient id="waterGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="50%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>

            {/* Glass sheen highlight */}
            <linearGradient id="glassSheen" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
              <stop offset="40%" stopColor="#ffffff" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>

            <clipPath id="tankClip">
              <rect x="1" y="1" width={width - 2} height={height - 2} rx={tankRadius - 1} />
            </clipPath>
          </defs>

          {/* Tank body outline */}
          <rect
            x="0.5"
            y="0.5"
            width={width - 1}
            height={height - 1}
            rx={tankRadius}
            className="fill-slate-100 dark:fill-slate-800 stroke-slate-300 dark:stroke-slate-700"
            strokeWidth="1"
          />

          {/* Internal clipped content */}
          <g clipPath="url(#tankClip)">
            {/* Liquid Fill */}
            <rect
              x="0"
              y="0"
              width={fillWidth}
              height={height}
              fill="url(#waterGrad)"
              className="transition-all duration-700 ease-out opacity-90"
            />

            {/* Wave crest highlight */}
            <path
              d={`M ${fillWidth - 4} 0 Q ${fillWidth} ${height / 2} ${fillWidth - 4} ${height}`}
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeOpacity="0.6"
            />

            {/* Sub-surface bubble / wave lines */}
            <path
              d={`M ${Math.max(0, fillWidth - 25)} ${height * 0.3} Q ${fillWidth - 10} ${height * 0.25} ${fillWidth - 5} ${height * 0.35}`}
              fill="none"
              stroke="#ffffff"
              strokeWidth="1"
              strokeOpacity="0.4"
            />
            <path
              d={`M ${Math.max(0, fillWidth - 40)} ${height * 0.7} Q ${fillWidth - 20} ${height * 0.75} ${fillWidth - 8} ${height * 0.65}`}
              fill="none"
              stroke="#ffffff"
              strokeWidth="1"
              strokeOpacity="0.3"
            />

            {/* Top glass reflection sheen */}
            <rect
              x="0"
              y="0"
              width={width}
              height={height * 0.45}
              fill="url(#glassSheen)"
            />

            {/* Ruler tick marks on the tank */}
            {[0.25, 0.5, 0.75].map((ratio) => (
              <line
                key={ratio}
                x1={width * ratio}
                y1={height - 8}
                x2={width * ratio}
                y2={height - 2}
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="1,1"
                opacity="0.6"
              />
            ))}
          </g>

          {/* Tank outer border */}
          <rect
            x="0.5"
            y="0.5"
            width={width - 1}
            height={height - 1}
            rx={tankRadius}
            fill="none"
            className="stroke-slate-300 dark:stroke-slate-600"
            strokeWidth="1"
          />

          {/* Text inside gauge */}
          <text
            x="8"
            y="17"
            className="text-[10px] font-bold fill-slate-700 dark:fill-slate-200"
            style={{ fontSize: "10px", fontWeight: 700 }}
          >
            {waterLevel !== null ? `${waterLevel.toFixed(1)} m` : "—"}
          </text>
          <text
            x="8"
            y="32"
            className="text-[9px] fill-slate-500 dark:text-slate-300 dark:fill-slate-300"
            style={{ fontSize: "9px" }}
          >
            {effectiveCapacity !== null ? `${effectiveCapacity.toLocaleString()} 萬m³` : "水量 —"}
          </text>
        </svg>
      </div>
    </div>
  );
}
