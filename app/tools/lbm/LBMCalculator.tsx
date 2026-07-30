"use client";

import { useMemo, useState } from "react";
import { cardClass, inputClass, primaryButtonClass, secondaryButtonClass, toggleButtonClass } from "@/components/Tools/toolStyles";

type Gender = "male" | "female";

interface LBMResult {
  lbm: number;
  bodyFat: number;
  bodyFatPct: number;
  lbmCategory: string;
  lbmCategoryColor: string;
  suggestion: string;
}

/**
 * Boer 公式估算去脂體重 (LBM)
 * 男性: 0.407×體重(kg) + 0.267×身高(cm) − 19.2
 * 女性: 0.252×體重(kg) + 0.473×身高(cm) − 48.3
 */
function calcLBM(height: number, weight: number, gender: Gender): LBMResult {
  const lbmRaw = gender === "male" ? 0.407 * weight + 0.267 * height - 19.2 : 0.252 * weight + 0.473 * height - 48.3;
  const lbm = Math.round(lbmRaw * 10) / 10;
  const bodyFat = Math.round((weight - lbm) * 10) / 10;
  const bodyFatPct = Math.round((bodyFat / weight) * 1000) / 10;

  // 台灣衛福部體脂分類參考值
  const idealFatRange = gender === "male" ? [10, 20] : [18, 28];
  let lbmCategory: string;
  let lbmCategoryColor: string;
  let suggestion: string;

  if (bodyFatPct < idealFatRange[0]) {
    lbmCategory = "體脂過低";
    lbmCategoryColor = "text-blue-600";
    suggestion = "體脂率偏低，雖然整體肌肉量高，但過低體脂可能影響荷爾蒙分泌，建議諮詢醫師或營養師。";
  } else if (bodyFatPct <= idealFatRange[1]) {
    lbmCategory = "理想範圍";
    lbmCategoryColor = "text-green-600";
    suggestion = "您的去脂體重與體脂率均在理想範圍，維持目前的飲食與運動習慣，定期追蹤即可。";
  } else if (bodyFatPct <= (gender === "male" ? 25 : 33)) {
    lbmCategory = "略高";
    lbmCategoryColor = "text-yellow-600";
    suggestion = "體脂率略高，建議增加有氧與重量訓練，同時調整飲食結構，提高蛋白質比例，逐步改善體組成。";
  } else {
    lbmCategory = "體脂過高";
    lbmCategoryColor = "text-red-500";
    suggestion = "體脂率明顯偏高，增加慢性病風險。建議就醫評估，搭配飲食控制與規律運動，目標每月降低 0.5–1% 體脂。";
  }

  return { lbm, bodyFat, bodyFatPct, lbmCategory, lbmCategoryColor, suggestion };
}

const BODY_FAT_STANDARDS = [
  { label: "體脂過低", male: "< 10%", female: "< 18%", color: "bg-blue-100 text-blue-700" },
  { label: "理想範圍", male: "10 – 20%", female: "18 – 28%", color: "bg-green-100 text-green-700" },
  { label: "略高", male: "21 – 25%", female: "29 – 33%", color: "bg-yellow-100 text-yellow-700" },
  { label: "體脂過高", male: "> 25%", female: "> 33%", color: "bg-red-100 text-red-600" },
];

export default function LBMCalculator() {
  const [height, setHeight] = useState("170");
  const [weight, setWeight] = useState("65");
  const [gender, setGender] = useState<Gender>("male");
  const [calculated, setCalculated] = useState(false);

  const result = useMemo<LBMResult | null>(() => {
    const h = parseFloat(height);
    const w = parseFloat(weight);
    if (!calculated || isNaN(h) || isNaN(w) || h <= 0 || w <= 0) return null;
    return calcLBM(h, w, gender);
  }, [height, weight, gender, calculated]);

  const handleCalculate = () => {
    const h = parseFloat(height);
    const w = parseFloat(weight);
    if (!h || !w || h <= 0 || w <= 0 || h > 300 || w > 500) return;
    setCalculated(true);
  };

  const handleReset = () => {
    setHeight("170");
    setWeight("65");
    setGender("male");
    setCalculated(false);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 md:text-4xl">💪 去脂體重 (LBM) 計算器</h1>
        <p className="text-neutral-600">以 Boer 公式估算去脂體重與體脂率，了解您的身體組成狀況。</p>
      </div>

      <div className={cardClass}>
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700">性別</label>
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
            <label htmlFor="lbm-height" className="mb-1.5 block text-sm font-medium text-neutral-700">
              身高
            </label>
            <div className="relative">
              <input
                id="lbm-height"
                type="number"
                min="100"
                max="250"
                step="0.1"
                value={height}
                onChange={(e) => {
                  setHeight(e.target.value);
                  setCalculated(false);
                }}
                className={`${inputClass} pr-10`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">cm</span>
            </div>
          </div>

          <div>
            <label htmlFor="lbm-weight" className="mb-1.5 block text-sm font-medium text-neutral-700">
              體重
            </label>
            <div className="relative">
              <input
                id="lbm-weight"
                type="number"
                min="20"
                max="300"
                step="0.1"
                value={weight}
                onChange={(e) => {
                  setWeight(e.target.value);
                  setCalculated(false);
                }}
                className={`${inputClass} pr-10`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">kg</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={handleCalculate} className={primaryButtonClass}>
            計算去脂體重
          </button>
          <button onClick={handleReset} className={secondaryButtonClass}>
            重設
          </button>
        </div>
      </div>

      {result && (
        <div className={cardClass}>
          <h2 className="text-xl font-bold text-neutral-800">計算結果</h2>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-lg bg-zumthor p-4">
              <p className="mb-1 text-xs text-neutral-500">去脂體重</p>
              <p className="text-2xl font-bold text-primary">{result.lbm}</p>
              <p className="text-xs text-neutral-500">kg</p>
            </div>
            <div className="rounded-lg bg-neutral-50 p-4">
              <p className="mb-1 text-xs text-neutral-500">體脂重</p>
              <p className="text-2xl font-bold text-neutral-800">{result.bodyFat}</p>
              <p className="text-xs text-neutral-500">kg</p>
            </div>
            <div className="rounded-lg bg-neutral-50 p-4">
              <p className="mb-1 text-xs text-neutral-500">體脂率</p>
              <p className={`text-2xl font-bold ${result.lbmCategoryColor}`}>{result.bodyFatPct}%</p>
              <p className={`text-xs font-medium ${result.lbmCategoryColor}`}>{result.lbmCategory}</p>
            </div>
          </div>

          <div className="rounded-lg bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-600">💡 {result.suggestion}</div>

          <p className="text-xs text-neutral-500">※ 本結果為 Boer 公式估算值，僅供健康管理參考，不取代專業醫療診斷。</p>
        </div>
      )}

      <div className={cardClass}>
        <h2 className="mb-4 text-xl font-bold text-neutral-800">體脂率標準對照（台灣衛福部參考值）</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="pb-2 pr-4 font-medium">分類</th>
                <th className="pb-2 pr-4 font-medium">男性</th>
                <th className="pb-2 font-medium">女性</th>
              </tr>
            </thead>
            <tbody>
              {BODY_FAT_STANDARDS.map(({ label, male: m, female: f, color }) => (
                <tr key={label} className="border-b border-neutral-100 last:border-0">
                  <td className="py-2 pr-4">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${color}`}>{label}</span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-neutral-800">{m}</td>
                  <td className="py-2 font-mono text-neutral-800">{f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
