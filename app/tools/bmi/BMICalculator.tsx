"use client";

import { useMemo, useState } from "react";

interface BMIResult {
  bmi: number;
  category: string;
  categoryColor: string;
  description: string;
  suggestion: string;
}

/** Calculates BMI and classifies it per Taiwan HPA (國民健康署) standards. */
function calculateBMI(height: number, weight: number): BMIResult {
  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  const rounded = Math.round(bmi * 10) / 10;

  if (bmi < 18.5) {
    return {
      bmi: rounded,
      category: "體重過輕",
      categoryColor: "text-blue-600",
      description: "BMI 低於 18.5，體重偏輕，建議增加均衡飲食攝取。",
      suggestion: "建議諮詢營養師，制定健康增重計畫，並搭配適當的力量訓練。",
    };
  } else if (bmi < 24) {
    return {
      bmi: rounded,
      category: "健康體重",
      categoryColor: "text-green-600",
      description: "BMI 18.5–23.9，您的體重在健康範圍內，繼續保持！",
      suggestion: "維持均衡飲食與規律運動，每週至少 150 分鐘中等強度有氧運動。",
    };
  } else if (bmi < 27) {
    return {
      bmi: rounded,
      category: "體重過重",
      categoryColor: "text-yellow-600",
      description: "BMI 24–26.9，體重略高，建議適度調整飲食與增加運動。",
      suggestion: "減少精緻糖與高脂食物攝取，增加蔬果比例，每週規律運動 3–5 次。",
    };
  } else if (bmi < 30) {
    return {
      bmi: rounded,
      category: "輕度肥胖",
      categoryColor: "text-orange-600",
      description: "BMI 27–29.9，屬於輕度肥胖，增加慢性病風險，建議積極改善。",
      suggestion: "建議諮詢醫師或專業健康管理師，訂立減重目標與計畫。",
    };
  } else if (bmi < 35) {
    return {
      bmi: rounded,
      category: "中度肥胖",
      categoryColor: "text-red-500",
      description: "BMI 30–34.9，屬於中度肥胖，健康風險較高，建議尋求專業協助。",
      suggestion: "請儘速諮詢醫師，可能需要結合醫療介入、飲食控制與運動計畫。",
    };
  } else {
    return {
      bmi: rounded,
      category: "重度肥胖",
      categoryColor: "text-red-700",
      description: "BMI ≥ 35，屬於重度肥胖，請立即尋求醫療協助。",
      suggestion: "請立即與醫師討論，評估是否需要藥物或手術治療。",
    };
  }
}

const BMI_CATEGORIES = [
  { label: "體重過輕", range: "< 18.5", color: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" },
  { label: "健康體重", range: "18.5 – 23.9", color: "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300" },
  { label: "體重過重", range: "24 – 26.9", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-300" },
  { label: "輕度肥胖", range: "27 – 29.9", color: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300" },
  { label: "中度肥胖", range: "30 – 34.9", color: "bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-300" },
  { label: "重度肥胖", range: "≥ 35", color: "bg-red-200 text-red-700 dark:bg-red-900/60 dark:text-red-200" },
];

export default function BMICalculator() {
  const [height, setHeight] = useState("170");
  const [weight, setWeight] = useState("65");
  const [calculated, setCalculated] = useState(false);

  const result = useMemo<BMIResult | null>(() => {
    const h = parseFloat(height);
    const w = parseFloat(weight);
    if (!calculated || isNaN(h) || isNaN(w) || h <= 0 || w <= 0) return null;
    return calculateBMI(h, w);
  }, [height, weight, calculated]);

  const handleCalculate = () => {
    const h = parseFloat(height);
    const w = parseFloat(weight);
    if (!h || !w || h <= 0 || w <= 0 || h > 300 || w > 500) return;
    setCalculated(true);
  };

  const handleReset = () => {
    setHeight("170");
    setWeight("65");
    setCalculated(false);
  };

  // Gauge position (0–100%) mapped from BMI 15–40+.
  const gaugePercent = result ? Math.min(100, Math.max(0, ((result.bmi - 15) / 25) * 100)) : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">⚖️ BMI 計算器</h1>
        <p className="text-neutral-600 dark:text-slate-300">採用台灣國民健康署 BMI 分類標準。輸入您的身高與體重，立即計算 BMI 值。</p>
      </div>

      <div className="space-y-5 rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="height" className="mb-2 block text-sm font-medium text-neutral-700 dark:text-slate-200">
              身高 (公分)
            </label>
            <div className="relative">
              <input
                id="height"
                type="number"
                value={height}
                min={100}
                max={250}
                step={0.1}
                onChange={(e) => {
                  setHeight(e.target.value);
                  setCalculated(false);
                }}
                className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 pr-12 text-lg text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                placeholder="例: 170"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-500 dark:text-slate-400">cm</span>
            </div>
          </div>

          <div>
            <label htmlFor="weight" className="mb-2 block text-sm font-medium text-neutral-700 dark:text-slate-200">
              體重 (公斤)
            </label>
            <div className="relative">
              <input
                id="weight"
                type="number"
                value={weight}
                min={20}
                max={300}
                step={0.1}
                onChange={(e) => {
                  setWeight(e.target.value);
                  setCalculated(false);
                }}
                className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 pr-12 text-lg text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                placeholder="例: 65"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-500 dark:text-slate-400">kg</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCalculate}
            className="flex-1 rounded-lg bg-primary py-3 text-base font-semibold text-white transition-colors hover:bg-primaryho"
          >
            計算 BMI
          </button>
          <button
            onClick={handleReset}
            className="rounded-lg border border-neutral-300 px-6 py-3 text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            重置
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-5 rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-center">
            <p className="mb-1 text-sm text-neutral-500 dark:text-slate-400">您的 BMI 值</p>
            <p className="text-6xl font-bold tabular-nums text-neutral-800 dark:text-slate-100">{result.bmi}</p>
            <p className={`mt-2 text-xl font-semibold ${result.categoryColor}`}>{result.category}</p>
          </div>

          {gaugePercent !== null && (
            <div className="space-y-1">
              <div
                className="relative h-4 overflow-hidden rounded-full"
                style={{
                  background: "linear-gradient(to right, #3b82f6 0%, #22c55e 25%, #eab308 50%, #f97316 70%, #ef4444 85%, #b91c1c 100%)",
                }}
              >
                <div
                  className="absolute top-0 h-full w-1 bg-white shadow-md transition-all duration-500"
                  style={{ left: `calc(${gaugePercent}% - 2px)` }}
                />
              </div>
              <div className="flex justify-between text-xs text-neutral-500 dark:text-slate-400">
                <span>15</span>
                <span>18.5</span>
                <span>24</span>
                <span>27</span>
                <span>30</span>
                <span>35+</span>
              </div>
            </div>
          )}

          <div className="space-y-2 rounded-lg bg-neutral-50 p-4 dark:bg-slate-800/60">
            <p className="text-sm text-neutral-800 dark:text-slate-200">{result.description}</p>
            <p className="text-sm text-neutral-600 dark:text-slate-400">{result.suggestion}</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 text-lg font-bold text-neutral-800 dark:text-slate-100">BMI 分類標準 (台灣國健署)</h2>
        <div className="space-y-2">
          {BMI_CATEGORIES.map((cat) => (
            <div
              key={cat.label}
              className={`flex items-center justify-between rounded-lg px-4 py-2 text-sm font-medium ${cat.color} ${
                result?.category === cat.label ? "ring-2 ring-primary" : ""
              }`}
            >
              <span>{cat.label}</span>
              <span className="tabular-nums">{cat.range}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="px-4 text-center text-xs text-neutral-500 dark:text-slate-400">⚠️ 本工具僅供參考，不構成醫療建議。如有健康疑慮，請諮詢專業醫療人員。</p>
    </div>
  );
}
