"use client";

import { useMemo, useState } from "react";
import { cardClass, inputClass, primaryButtonClass, secondaryButtonClass, toggleButtonClass } from "@/components/Tools/toolStyles";

type Gender = "male" | "female";

interface VO2MaxResult {
  vo2max: number;
  hrMax: number;
  category: string;
  categoryColor: string;
  description: string;
  suggestion: string;
}

/** 最大心率（Tanaka 公式，2001）：HRmax = 208 − 0.7 × 年齡 */
function calcHRMax(age: number): number {
  return Math.round(208 - 0.7 * age);
}

/** VO2Max（Uth-Sørensen-Overgaard-Pedersen 公式）：VO2Max ≈ 15 × (HRmax / HRrest) */
function calcVO2Max(age: number, hrRest: number, gender: Gender): VO2MaxResult {
  const hrMax = calcHRMax(age);
  const rawVO2 = 15 * (hrMax / hrRest);
  const vo2max = Math.round(rawVO2 * 10) / 10;

  const getMaleCategory = (v: number) => {
    if (v >= 55) return { category: "非常優秀", categoryColor: "text-green-700", description: "VO2Max 極佳，心肺耐力媲美競技運動員，繼續保持。", suggestion: "維持目前的高強度有氧訓練計畫，並搭配充足恢復時間。" };
    if (v >= 46) return { category: "優秀", categoryColor: "text-green-600", description: "VO2Max 明顯優於同齡平均，心肺健康狀況良好。", suggestion: "繼續保持規律運動，可嘗試間歇訓練 (HIIT) 以進一步提升。" };
    if (v >= 38) return { category: "良好", categoryColor: "text-blue-600", description: "VO2Max 高於同齡平均，心肺耐力良好。", suggestion: "可增加每週有氧訓練頻率至 4–5 次，目標逐步提升 VO2Max。" };
    if (v >= 30) return { category: "一般", categoryColor: "text-yellow-600", description: "VO2Max 處於同齡平均水準，有提升空間。", suggestion: "每週至少進行 150 分鐘中等強度有氧運動（快走、騎車、游泳），循序漸進提升心肺耐力。" };
    return { category: "偏低", categoryColor: "text-red-500", description: "VO2Max 低於同齡平均，心肺耐力較弱，增加慢性病風險。", suggestion: "建議先從低強度有氧開始（如快走），並諮詢醫師確認運動安全性，逐步增加強度。" };
  };

  const getFemaleCategory = (v: number) => {
    if (v >= 49) return { category: "非常優秀", categoryColor: "text-green-700", description: "VO2Max 極佳，心肺耐力媲美競技運動員，繼續保持。", suggestion: "維持目前的高強度有氧訓練計畫，並搭配充足恢復時間。" };
    if (v >= 40) return { category: "優秀", categoryColor: "text-green-600", description: "VO2Max 明顯優於同齡平均，心肺健康狀況良好。", suggestion: "繼續保持規律運動，可嘗試間歇訓練 (HIIT) 以進一步提升。" };
    if (v >= 32) return { category: "良好", categoryColor: "text-blue-600", description: "VO2Max 高於同齡平均，心肺耐力良好。", suggestion: "可增加每週有氧訓練頻率至 4–5 次，目標逐步提升 VO2Max。" };
    if (v >= 24) return { category: "一般", categoryColor: "text-yellow-600", description: "VO2Max 處於同齡平均水準，有提升空間。", suggestion: "每週至少進行 150 分鐘中等強度有氧運動，循序漸進提升心肺耐力。" };
    return { category: "偏低", categoryColor: "text-red-500", description: "VO2Max 低於同齡平均，心肺耐力較弱，增加慢性病風險。", suggestion: "建議先從低強度有氧開始（如快走），並諮詢醫師確認運動安全性，逐步增加強度。" };
  };

  const catInfo = gender === "male" ? getMaleCategory(vo2max) : getFemaleCategory(vo2max);
  return { vo2max, hrMax, ...catInfo };
}

const VO2_STANDARDS = [
  { label: "非常優秀", male: "≥ 55", female: "≥ 49", color: "bg-green-200 text-green-800 dark:bg-green-950/70 dark:text-green-200" },
  { label: "優秀", male: "46 – 54", female: "40 – 48", color: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
  { label: "良好", male: "38 – 45", female: "32 – 39", color: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  { label: "一般", male: "30 – 37", female: "24 – 31", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300" },
  { label: "偏低", male: "< 30", female: "< 24", color: "bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-300" },
];

export default function VO2MaxCalculator() {
  const [age, setAge] = useState("30");
  const [hrRest, setHrRest] = useState("65");
  const [gender, setGender] = useState<Gender>("male");
  const [calculated, setCalculated] = useState(false);

  const result = useMemo<VO2MaxResult | null>(() => {
    const a = parseInt(age, 10);
    const r = parseInt(hrRest, 10);
    if (!calculated || isNaN(a) || isNaN(r) || a < 10 || a > 100 || r < 30 || r > 120) return null;
    return calcVO2Max(a, r, gender);
  }, [age, hrRest, gender, calculated]);

  const handleCalculate = () => {
    const a = parseInt(age, 10);
    const r = parseInt(hrRest, 10);
    if (!a || !r || a < 10 || a > 100 || r < 30 || r > 120) return;
    setCalculated(true);
  };

  const handleReset = () => {
    setAge("30");
    setHrRest("65");
    setGender("male");
    setCalculated(false);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">🫁 VO2Max 估算器</h1>
        <p className="text-neutral-600 dark:text-slate-300">輸入年齡、安靜心率，以安靜心率法 (Uth 公式) 快速估算您的最大攝氧量，評估心肺耐力等級。</p>
      </div>

      <div className={cardClass}>
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-slate-200">性別</label>
          <div className="flex gap-3">
            {(["male", "female"] as Gender[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => {
                  setGender(g);
                  setCalculated(false);
                }}
                className={toggleButtonClass(gender === g)}
              >
                {g === "male" ? "♂ 男性" : "♀ 女性"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="vo2-age" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-slate-200">
              年齡
            </label>
            <div className="relative">
              <input
                id="vo2-age"
                type="number"
                min="10"
                max="100"
                value={age}
                onChange={(e) => {
                  setAge(e.target.value);
                  setCalculated(false);
                }}
                className={`${inputClass} pr-12`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500 dark:text-slate-400">歲</span>
            </div>
          </div>

          <div>
            <label htmlFor="vo2-hrrest" className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-slate-200">
              安靜心率
            </label>
            <div className="relative">
              <input
                id="vo2-hrrest"
                type="number"
                min="30"
                max="120"
                value={hrRest}
                onChange={(e) => {
                  setHrRest(e.target.value);
                  setCalculated(false);
                }}
                className={`${inputClass} pr-14`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500 dark:text-slate-400">bpm</span>
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">早晨起床前，靜臥測量 1 分鐘</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={handleCalculate} className={primaryButtonClass}>
            估算 VO2Max
          </button>
          <button onClick={handleReset} className={secondaryButtonClass}>
            重設
          </button>
        </div>
      </div>

      {result && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold text-neutral-800 dark:text-slate-100">估算結果</h2>

          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="rounded-lg bg-zumthor p-5 dark:bg-primary/20">
              <p className="mb-1 text-xs text-neutral-500 dark:text-slate-400">VO2Max</p>
              <p className="text-3xl font-bold text-primary">{result.vo2max}</p>
              <p className="text-xs text-neutral-500 dark:text-slate-400">mL/kg/min</p>
              <p className={`mt-1 text-sm font-semibold ${result.categoryColor}`}>{result.category}</p>
            </div>
            <div className="rounded-lg bg-neutral-50 p-5 dark:bg-slate-800/60">
              <p className="mb-1 text-xs text-neutral-500 dark:text-slate-400">最大心率 (估)</p>
              <p className="text-3xl font-bold text-neutral-800 dark:text-slate-100">{result.hrMax}</p>
              <p className="text-xs text-neutral-500 dark:text-slate-400">bpm</p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">Tanaka 公式</p>
            </div>
          </div>

          <div className="text-sm leading-relaxed text-neutral-600 dark:text-slate-300">{result.description}</div>

          <div className="rounded-lg bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-600 dark:bg-slate-800/60 dark:text-slate-300">💡 {result.suggestion}</div>

          <p className="text-xs text-neutral-500 dark:text-slate-400">※ 此估算值基於安靜心率，誤差約 ±5 mL/kg/min，僅供健康管理參考。正式評估請接受運動心肺測試。</p>
        </div>
      )}

      <div className={cardClass}>
        <h2 className="mb-4 text-xl font-bold text-neutral-800 dark:text-slate-100">VO2Max 等級對照（ACSM 標準，mL/kg/min）</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-slate-700 dark:text-slate-400">
                <th className="pb-2 pr-4 font-medium">等級</th>
                <th className="pb-2 pr-4 font-medium">男性</th>
                <th className="pb-2 font-medium">女性</th>
              </tr>
            </thead>
            <tbody>
              {VO2_STANDARDS.map(({ label, male: m, female: f, color }) => (
                <tr key={label} className="border-b border-neutral-100 last:border-0 dark:border-slate-800">
                  <td className="py-2 pr-4">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${color}`}>{label}</span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-neutral-800 dark:text-slate-200">{m}</td>
                  <td className="py-2 font-mono text-neutral-800 dark:text-slate-200">{f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`space-y-2 text-sm text-neutral-600 dark:text-slate-300 ${cardClass}`}>
        <h3 className="text-base font-semibold text-neutral-800 dark:text-slate-100">如何正確測量安靜心率？</h3>
        <ul className="list-inside list-disc space-y-1.5">
          <li>選擇清晨剛醒、尚未起身時測量</li>
          <li>靜臥或靜坐休息 5 分鐘後開始</li>
          <li>以手指按壓頸部或手腕脈搏，計算 1 分鐘的跳動次數</li>
          <li>連續測量 3 天取平均值，結果更準確</li>
          <li>壓力大、睡眠不足、剛運動後的心率數值偏高，請避免此時測量</li>
          <li>若有 Apple Watch 或 iPhone「健康」App，可直接複製其記錄的靜止心率數值填入，更省事也更準確</li>
        </ul>
      </div>
    </div>
  );
}
