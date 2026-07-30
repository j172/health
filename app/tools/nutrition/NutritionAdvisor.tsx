"use client";

import { useState } from "react";
import { cardClass, disclaimerClass, inputClass, labelClass, primaryButtonClass, toggleButtonClass } from "@/components/Tools/toolStyles";

type Goal = "maintain" | "lose" | "gain";
type Gender = "male" | "female";

interface NutritionInput {
  age: number;
  gender: Gender;
  heightCm: number;
  weightKg: number;
  activityLevel: number;
  goal: Goal;
}

interface NutritionResult {
  tdee: number;
  targetCalories: number;
  protein: number;
  carbs: number;
  fat: number;
  proteinCal: number;
  carbsCal: number;
  fatCal: number;
}

const ACTIVITY_LEVELS = [
  { value: 1, label: "久坐（幾乎不運動）", multiplier: 1.2 },
  { value: 2, label: "輕度活動（每週 1–3 天）", multiplier: 1.375 },
  { value: 3, label: "中度活動（每週 3–5 天）", multiplier: 1.55 },
  { value: 4, label: "高度活動（每週 6–7 天）", multiplier: 1.725 },
  { value: 5, label: "超高活動（體力勞動 / 每日訓練）", multiplier: 1.9 },
];

const GOAL_OPTIONS: { value: Goal; label: string; calDelta: number }[] = [
  { value: "maintain", label: "維持體重", calDelta: 0 },
  { value: "lose", label: "減脂（每週 -0.5 kg）", calDelta: -500 },
  { value: "gain", label: "增肌（每週 +0.25 kg）", calDelta: 250 },
];

function calcBMR(g: Gender, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return g === "male" ? base + 5 : base - 161;
}

function calcNutrition(input: NutritionInput): NutritionResult {
  const multiplier = ACTIVITY_LEVELS.find((a) => a.value === input.activityLevel)?.multiplier ?? 1.55;
  const calDelta = GOAL_OPTIONS.find((g) => g.value === input.goal)?.calDelta ?? 0;

  const bmr = calcBMR(input.gender, input.weightKg, input.heightCm, input.age);
  const tdee = Math.round(bmr * multiplier);
  const targetCalories = Math.round(tdee + calDelta);

  // Protein: 2.0g/kg (gain), 1.8g/kg (lose), 1.6g/kg (maintain).
  const proteinRatio = input.goal === "gain" ? 2.0 : input.goal === "lose" ? 1.8 : 1.6;
  const protein = Math.round(input.weightKg * proteinRatio);
  // Fat: 25% of target calories.
  const fat = Math.round((targetCalories * 0.25) / 9);
  // Carbs: the remainder.
  const carbsCal = targetCalories - protein * 4 - fat * 9;
  const carbs = Math.round(Math.max(carbsCal / 4, 0));

  return { tdee, targetCalories, protein, carbs, fat, proteinCal: protein * 4, carbsCal: carbs * 4, fatCal: fat * 9 };
}

export default function NutritionAdvisor() {
  const [form, setForm] = useState<NutritionInput>({ age: 30, gender: "male", heightCm: 170, weightKg: 70, activityLevel: 3, goal: "maintain" });
  const [result, setResult] = useState<NutritionResult | null>(null);

  const handleCalc = () => setResult(calcNutrition(form));

  return (
    <section aria-labelledby="nutrition-heading">
      <h1 id="nutrition-heading" className="mb-2 text-3xl font-bold text-neutral-800">
        🥗 每日營養素建議計算器
      </h1>
      <p className="mb-8 text-sm text-neutral-600">基於 Mifflin-St Jeor 公式計算每日總消耗熱量（TDEE），再依您的目標分配三大營養素。</p>

      <div className={`mb-6 ${cardClass}`}>
        <div>
          <label className={labelClass}>性別</label>
          <div className="flex gap-3">
            {(["male", "female"] as Gender[]).map((g) => (
              <button key={g} type="button" onClick={() => setForm((f) => ({ ...f, gender: g }))} className={toggleButtonClass(form.gender === g)}>
                {g === "male" ? "男性" : "女性"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { key: "age", label: "年齡", unit: "歲", min: 15, max: 99 },
            { key: "heightCm", label: "身高", unit: "cm", min: 100, max: 250 },
            { key: "weightKg", label: "體重", unit: "kg", min: 30, max: 300 },
          ].map(({ key, label, unit, min, max }) => (
            <div key={key}>
              <label htmlFor={`input-${key}`} className={labelClass}>
                {label}（{unit}）
              </label>
              <input
                id={`input-${key}`}
                type="number"
                min={min}
                max={max}
                value={form[key as keyof NutritionInput] as number}
                onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
                className={inputClass}
              />
            </div>
          ))}
        </div>

        <div>
          <label htmlFor="activity-select" className={labelClass}>
            活動量
          </label>
          <select
            id="activity-select"
            value={form.activityLevel}
            onChange={(e) => setForm((f) => ({ ...f, activityLevel: Number(e.target.value) }))}
            className={inputClass}
          >
            {ACTIVITY_LEVELS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>目標</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            {GOAL_OPTIONS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, goal: g.value }))}
                className={toggleButtonClass(form.goal === g.value)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <button type="button" onClick={handleCalc} className={primaryButtonClass}>
          計算營養建議
        </button>
      </div>

      {result && (
        <div className={`space-y-6 ${cardClass}`} aria-live="polite">
          <h2 className="text-xl font-bold text-neutral-800">計算結果</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-neutral-50 p-4 text-center">
              <p className="mb-1 text-xs text-neutral-500">每日總消耗熱量（TDEE）</p>
              <p className="text-3xl font-bold text-primary">{result.tdee}</p>
              <p className="mt-1 text-xs text-neutral-500">大卡</p>
            </div>
            <div className="rounded-lg bg-zumthor p-4 text-center">
              <p className="mb-1 text-xs text-neutral-500">建議每日攝取熱量</p>
              <p className="text-3xl font-bold text-primary">{result.targetCalories}</p>
              <p className="mt-1 text-xs text-neutral-500">大卡</p>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-base font-semibold text-neutral-800">每日三大營養素建議</h3>
            <div className="space-y-3">
              {[
                { label: "蛋白質", value: result.protein, cal: result.proteinCal, color: "bg-blue-500", pct: Math.round((result.proteinCal / result.targetCalories) * 100) },
                { label: "碳水化合物", value: result.carbs, cal: result.carbsCal, color: "bg-amber-500", pct: Math.round((result.carbsCal / result.targetCalories) * 100) },
                { label: "脂肪", value: result.fat, cal: result.fatCal, color: "bg-rose-500", pct: Math.round((result.fatCal / result.targetCalories) * 100) },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium text-neutral-800">{item.label}</span>
                    <span className="text-neutral-500">
                      {item.value}g（{item.cal} 大卡 / {item.pct}%）
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                    <div className={`h-full ${item.color} rounded-full transition-all duration-500`} style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className={`border-t border-neutral-200 pt-4 ${disclaimerClass}`}>⚠️ 本工具結果僅供參考，實際飲食計畫建議諮詢營養師或醫師。</p>
        </div>
      )}
    </section>
  );
}
