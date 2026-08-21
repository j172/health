"use client";

import { useMemo, useState } from "react";
import { disclaimerClass, inputClass, labelClass, primaryButtonClass, toggleButtonClass } from "@/components/Tools/toolStyles";

type Gender = "male" | "female";

interface BodyFatResult {
  bodyFatPercent: number;
  fatMass: number;
  leanMass: number;
  category: string;
  categoryColor: string;
  description: string;
  suggestion: string;
}

/**
 * 美國海軍體脂率計算法 (Navy Method)
 * 男性：BF% = 86.010×log10(腹圍-頸圍) - 70.041×log10(身高) + 36.76
 * 女性：BF% = 163.205×log10(腰圍+臀圍-頸圍) - 97.684×log10(身高) - 78.387
 */
function calculateBodyFat(gender: Gender, height: number, neck: number, waist: number, hip: number, weight: number): BodyFatResult {
  let bf: number;
  if (gender === "male") {
    bf = 86.01 * Math.log10(waist - neck) - 70.041 * Math.log10(height) + 36.76;
  } else {
    bf = 163.205 * Math.log10(waist + hip - neck) - 97.684 * Math.log10(height) - 78.387;
  }
  bf = Math.max(2, Math.min(70, bf));
  const rounded = Math.round(bf * 10) / 10;
  const fatMass = Math.round(((weight * bf) / 100) * 10) / 10;
  const leanMass = Math.round((weight - fatMass) * 10) / 10;

  // ACSM 分類標準
  const categories =
    gender === "male"
      ? [
          { max: 6, label: "必要脂肪", color: "text-blue-600", desc: "體脂率低於必要脂肪下限，可能影響正常生理功能。", sug: "建議諮詢醫師，評估是否攝取足夠的營養。" },
          { max: 14, label: "運動員型", color: "text-green-500", desc: "專業運動員體脂範圍，肌肉量極高。", sug: "維持目前訓練強度，確保飲食中有足夠碳水與蛋白質。" },
          { max: 18, label: "體態優良", color: "text-green-600", desc: "體脂率在理想範圍，整體健康狀況良好。", sug: "繼續保持規律運動與均衡飲食。" },
          { max: 25, label: "一般", color: "text-yellow-600", desc: "體脂率屬一般範圍，可適當增加有氧與阻力訓練。", sug: "每週進行至少 3 次有氧運動，搭配力量訓練以提高基礎代謝率。" },
          { max: 999, label: "肥胖", color: "text-red-600", desc: "體脂率偏高，增加代謝疾病風險。", sug: "建議積極調整飲食並增加運動頻率，必要時諮詢醫師或營養師。" },
        ]
      : [
          { max: 14, label: "必要脂肪", color: "text-blue-600", desc: "體脂率低於女性必要脂肪下限，可能影響荷爾蒙與生殖功能。", sug: "建議立即諮詢婦科或內分泌科醫師。" },
          { max: 21, label: "運動員型", color: "text-green-500", desc: "女性運動員體脂範圍，整體體能優異。", sug: "注意補充足夠鐵質與鈣質，預防運動型骨質疏鬆。" },
          { max: 25, label: "體態優良", color: "text-green-600", desc: "體脂在健康理想範圍，外型勻稱。", sug: "繼續保持規律運動與均衡飲食，每年定期健康檢查。" },
          { max: 32, label: "一般", color: "text-yellow-600", desc: "體脂率處於一般範圍，可適度減少精緻食物攝取。", sug: "增加有氧運動頻率，搭配核心肌群訓練，改善體態。" },
          { max: 999, label: "肥胖", color: "text-red-600", desc: "體脂率偏高，建議積極改善生活型態。", sug: "諮詢醫師或健康管理師，制定個人化減脂計畫。" },
        ];

  const cat = categories.find((c) => rounded <= c.max) ?? categories[categories.length - 1];
  return { bodyFatPercent: rounded, fatMass, leanMass, category: cat.label, categoryColor: cat.color, description: cat.desc, suggestion: cat.sug };
}

export default function BodyFatCalculator() {
  const [gender, setGender] = useState<Gender>("male");
  const [height, setHeight] = useState("170");
  const [weight, setWeight] = useState("70");
  const [neck, setNeck] = useState("38");
  const [waist, setWaist] = useState("85");
  const [hip, setHip] = useState("95");
  const [calculated, setCalculated] = useState(false);

  const result = useMemo<BodyFatResult | null>(() => {
    if (!calculated) return null;
    const h = parseFloat(height);
    const w = parseFloat(weight);
    const n = parseFloat(neck);
    const wa = parseFloat(waist);
    const hp = parseFloat(hip);
    if ([h, w, n, wa, hp].some((v) => isNaN(v) || v <= 0)) return null;
    if (gender === "male" && wa <= n) return null;
    if (gender === "female" && wa + hp <= n) return null;
    return calculateBodyFat(gender, h, n, wa, hp, w);
  }, [calculated, gender, height, weight, neck, waist, hip]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">🔬 體脂率計算器</h1>
        <p className="text-neutral-600 dark:text-slate-300">採用美國海軍體脂計算法（Navy Method），對照 ACSM 標準分類。</p>
      </div>

      <div className="flex gap-3">
        {(["male", "female"] as Gender[]).map((g) => (
          <button
            key={g}
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="bf-height" className={labelClass}>
            身高 (cm)
          </label>
          <input
            id="bf-height"
            type="number"
            value={height}
            onChange={(e) => {
              setHeight(e.target.value);
              setCalculated(false);
            }}
            min="100"
            max="250"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="bf-weight" className={labelClass}>
            體重 (kg)
          </label>
          <input
            id="bf-weight"
            type="number"
            value={weight}
            onChange={(e) => {
              setWeight(e.target.value);
              setCalculated(false);
            }}
            min="30"
            max="300"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="bf-neck" className={labelClass}>
            頸圍 (cm)
          </label>
          <input
            id="bf-neck"
            type="number"
            value={neck}
            onChange={(e) => {
              setNeck(e.target.value);
              setCalculated(false);
            }}
            min="20"
            max="60"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="bf-waist" className={labelClass}>
            腰圍 (cm)
          </label>
          <input
            id="bf-waist"
            type="number"
            value={waist}
            onChange={(e) => {
              setWaist(e.target.value);
              setCalculated(false);
            }}
            min="40"
            max="200"
            className={inputClass}
          />
        </div>
        {gender === "female" && (
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="bf-hip" className={labelClass}>
              臀圍 (cm) <span className="text-primary">*女性需填</span>
            </label>
            <input
              id="bf-hip"
              type="number"
              value={hip}
              onChange={(e) => {
                setHip(e.target.value);
                setCalculated(false);
              }}
              min="60"
              max="200"
              className={inputClass}
            />
          </div>
        )}
      </div>

      <button onClick={() => setCalculated(true)} className={primaryButtonClass}>
        計算體脂率
      </button>

      {result && (
        <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-center">
            <p className="mb-1 text-sm text-neutral-500 dark:text-slate-400">您的體脂率</p>
            <p className={`text-5xl font-bold ${result.categoryColor}`}>
              {result.bodyFatPercent}
              <span className="text-2xl">%</span>
            </p>
            <p className={`mt-2 text-lg font-semibold ${result.categoryColor}`}>{result.category}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="rounded-lg bg-neutral-50 p-3 text-center dark:bg-slate-800/60">
              <p className="text-xs text-neutral-500 dark:text-slate-400">脂肪重量</p>
              <p className="text-xl font-bold text-neutral-800 dark:text-slate-100">
                {result.fatMass} <span className="text-sm font-normal">kg</span>
              </p>
            </div>
            <div className="rounded-lg bg-neutral-50 p-3 text-center dark:bg-slate-800/60">
              <p className="text-xs text-neutral-500 dark:text-slate-400">去脂體重</p>
              <p className="text-xl font-bold text-neutral-800 dark:text-slate-100">
                {result.leanMass} <span className="text-sm font-normal">kg</span>
              </p>
            </div>
          </div>

          <div className="space-y-2 rounded-lg bg-neutral-50 p-4 dark:bg-slate-800/60">
            <p className="text-sm text-neutral-800 dark:text-slate-200">{result.description}</p>
            <p className="text-sm text-neutral-600 dark:text-slate-300">💡 {result.suggestion}</p>
          </div>

          <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 dark:border-slate-800 dark:text-slate-400">
            <p className="mb-2 font-medium">{gender === "male" ? "男性" : "女性"}體脂率分類參考 (ACSM)</p>
            <div className="grid grid-cols-3 gap-1">
              {(gender === "male"
                ? [["必要脂肪", "<6%"], ["運動員型", "6–13%"], ["體態優良", "14–17%"], ["一般", "18–24%"], ["肥胖", ">25%"]]
                : [["必要脂肪", "<14%"], ["運動員型", "14–20%"], ["體態優良", "21–24%"], ["一般", "25–31%"], ["肥胖", ">32%"]]
              ).map(([label, range]) => (
                <span key={label} className="rounded bg-neutral-100 px-1.5 py-0.5 text-center dark:bg-slate-800 dark:text-slate-300">
                  {label}: {range}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className={disclaimerClass}>⚠️ 本工具採用美國海軍體脂計算法，結果僅供參考，精確測量需使用 DXA 或水下秤重法。</p>
    </div>
  );
}
