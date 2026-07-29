"use client";

import { useMemo, useState } from "react";
import { disclaimerClass, inputClass, labelClass, primaryButtonClass } from "@/components/Tools/toolStyles";

interface HeartRateZone {
  name: string;
  min: number;
  max: number;
  color: string;
  bg: string;
  benefit: string;
}

interface HeartRateResult {
  maxHr: number;
  restHr: number;
  hrr: number;
  zones: HeartRateZone[];
}

/**
 * Karvonen 公式：目標心率 = (最大心率-靜止心率)×強度% + 靜止心率
 * 最大心率採用 Tanaka 公式：207 - 0.7×年齡（比 220-年齡 更準確）
 */
function calculateHeartRateZones(age: number, restHr: number): HeartRateResult {
  const maxHr = Math.round(207 - 0.7 * age);
  const hrr = maxHr - restHr;

  const zoneConfigs = [
    { name: "恢復區 Zone 1", pct: [0.5, 0.6], color: "text-blue-500", bg: "bg-blue-50", benefit: "主動恢復、熱身、促進血液循環" },
    { name: "有氧基礎 Zone 2", pct: [0.6, 0.7], color: "text-green-500", bg: "bg-green-50", benefit: "燃脂效果最佳、提升有氧耐力基礎" },
    { name: "有氧提升 Zone 3", pct: [0.7, 0.8], color: "text-yellow-500", bg: "bg-yellow-50", benefit: "提升心肺功能、強化有氧效率" },
    { name: "無氧閾值 Zone 4", pct: [0.8, 0.9], color: "text-orange-500", bg: "bg-orange-50", benefit: "提升乳酸閾值、增強運動表現" },
    { name: "最大努力 Zone 5", pct: [0.9, 1.0], color: "text-red-500", bg: "bg-red-50", benefit: "最大氧氣攝取量、爆發力訓練" },
  ];

  const zones: HeartRateZone[] = zoneConfigs.map(({ name, pct, color, bg, benefit }) => ({
    name,
    min: Math.round(pct[0] * hrr + restHr),
    max: Math.round(pct[1] * hrr + restHr),
    color,
    bg,
    benefit,
  }));

  return { maxHr, restHr, hrr, zones };
}

export default function HeartRateCalculator() {
  const [age, setAge] = useState("35");
  const [restHr, setRestHr] = useState("65");
  const [calculated, setCalculated] = useState(false);

  const result = useMemo<HeartRateResult | null>(() => {
    if (!calculated) return null;
    const a = parseInt(age);
    const r = parseInt(restHr);
    if (isNaN(a) || isNaN(r) || a < 10 || a > 100 || r < 30 || r > 120) return null;
    return calculateHeartRateZones(a, r);
  }, [calculated, age, restHr]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 md:text-4xl">❤️ 目標心率計算器</h1>
        <p className="text-neutral-600">使用 Karvonen 公式計算 5 個運動強度心率區間，幫助您精準控制訓練強度。</p>
      </div>

      <div className="rounded-none bg-blue-50 p-4 text-sm text-neutral-600">
        <p className="mb-1 font-medium text-neutral-800">📋 如何量測靜止心率？</p>
        <p>早晨醒來尚未起床時，量測 60 秒脈搏次數（手腕橈動脈或頸動脈）的平均值最為準確。</p>
        <p className="mt-1">若有使用 Apple Watch 或 iPhone「健康」App，可直接查看其記錄的靜止心率數值，手動輸入即可，無需自行量測。</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="hr-age" className={labelClass}>
            年齡
          </label>
          <input
            id="hr-age"
            type="number"
            value={age}
            onChange={(e) => {
              setAge(e.target.value);
              setCalculated(false);
            }}
            min="10"
            max="100"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="hr-rest" className={labelClass}>
            靜止心率 (次/分)
          </label>
          <input
            id="hr-rest"
            type="number"
            value={restHr}
            onChange={(e) => {
              setRestHr(e.target.value);
              setCalculated(false);
            }}
            min="30"
            max="120"
            className={inputClass}
          />
        </div>
      </div>

      <button onClick={() => setCalculated(true)} className={primaryButtonClass}>
        計算心率區間
      </button>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-none border border-neutral-200 p-3 text-center">
              <p className="text-xs text-neutral-500">最大心率</p>
              <p className="text-2xl font-bold text-red-500">{result.maxHr}</p>
              <p className="text-xs text-neutral-500">次/分</p>
            </div>
            <div className="rounded-none border border-neutral-200 p-3 text-center">
              <p className="text-xs text-neutral-500">靜止心率</p>
              <p className="text-2xl font-bold text-blue-500">{result.restHr}</p>
              <p className="text-xs text-neutral-500">次/分</p>
            </div>
            <div className="rounded-none border border-neutral-200 p-3 text-center">
              <p className="text-xs text-neutral-500">心率儲備</p>
              <p className="text-2xl font-bold text-green-500">{result.hrr}</p>
              <p className="text-xs text-neutral-500">次/分</p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-neutral-800">Karvonen 五區心率區間</h3>
            {result.zones.map((zone) => (
              <div key={zone.name} className={`${zone.bg} rounded-none p-3`}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={`text-sm font-semibold ${zone.color}`}>{zone.name}</span>
                  <span className={`text-sm font-bold ${zone.color}`}>
                    {zone.min} – {zone.max} bpm
                  </span>
                </div>
                <p className="text-xs text-neutral-500">{zone.benefit}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/60">
                  <div className={`h-full rounded-full ${zone.color.replace("text-", "bg-")}`} style={{ width: `${((zone.min + zone.max) / 2 / result.maxHr) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-none bg-neutral-50 p-3 text-xs text-neutral-500">
            <p className="mb-1 font-medium">公式說明</p>
            <p>最大心率 = 207 - 0.7 × 年齡（Tanaka 公式，2001）</p>
            <p>目標心率 = (最大心率 - 靜止心率) × 強度% + 靜止心率（Karvonen 公式）</p>
          </div>
        </div>
      )}

      <p className={disclaimerClass}>⚠️ 心臟病患者或有心血管風險者，請先諮詢醫師再進行高強度訓練。</p>
    </div>
  );
}
