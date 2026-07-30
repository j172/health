"use client";

import { useMemo, useState } from "react";
import { cardClass, disclaimerClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass, toggleButtonClass } from "@/components/Tools/toolStyles";

type Gender = "male" | "female";
type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

interface CaloriesResult {
  bmr: number;
  tdee: number;
  weightLoss: number;
  mildWeightLoss: number;
  weightGain: number;
}

const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; description: string; multiplier: number }[] = [
  { value: "sedentary", label: "久坐不動", description: "辦公室工作，幾乎不運動", multiplier: 1.2 },
  { value: "light", label: "輕度活動", description: "每週運動 1–3 天", multiplier: 1.375 },
  { value: "moderate", label: "中度活動", description: "每週運動 3–5 天", multiplier: 1.55 },
  { value: "active", label: "高度活動", description: "每週運動 6–7 天或體力勞動", multiplier: 1.725 },
  { value: "very_active", label: "非常活躍", description: "每天劇烈運動或高體力工作", multiplier: 1.9 },
];

/** BMR via the Mifflin-St Jeor formula, then TDEE = BMR × activity multiplier. */
function calculateCalories(gender: Gender, age: number, height: number, weight: number, activity: ActivityLevel): CaloriesResult {
  const bmr = gender === "male" ? 10 * weight + 6.25 * height - 5 * age + 5 : 10 * weight + 6.25 * height - 5 * age - 161;
  const multiplier = ACTIVITY_LEVELS.find((a) => a.value === activity)?.multiplier ?? 1.2;
  const tdee = bmr * multiplier;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    weightLoss: Math.round(tdee - 500),
    mildWeightLoss: Math.round(tdee - 250),
    weightGain: Math.round(tdee + 500),
  };
}

export default function CaloriesCalculator() {
  const [gender, setGender] = useState<Gender>("male");
  const [age, setAge] = useState("30");
  const [height, setHeight] = useState("170");
  const [weight, setWeight] = useState("65");
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [calculated, setCalculated] = useState(false);

  const result = useMemo<CaloriesResult | null>(() => {
    if (!calculated) return null;
    const a = parseInt(age);
    const h = parseFloat(height);
    const w = parseFloat(weight);
    if (isNaN(a) || isNaN(h) || isNaN(w) || a <= 0 || h <= 0 || w <= 0) return null;
    return calculateCalories(gender, a, h, w, activity);
  }, [calculated, gender, age, height, weight, activity]);

  const handleCalculate = () => {
    if (!parseInt(age) || !parseFloat(height) || !parseFloat(weight)) return;
    setCalculated(true);
  };

  const handleReset = () => {
    setAge("30");
    setHeight("170");
    setWeight("65");
    setGender("male");
    setActivity("moderate");
    setCalculated(false);
  };

  const goals = result
    ? [
        { label: "🔴 積極減重", kcal: result.weightLoss, description: "每日減少 500 大卡，每週約減輕 0.5 公斤", color: "border-red-200 bg-red-50" },
        { label: "🟡 溫和減重", kcal: result.mildWeightLoss, description: "每日減少 250 大卡，較易維持且不易復胖", color: "border-yellow-200 bg-yellow-50" },
        { label: "🟢 維持體重", kcal: result.tdee, description: "維持目前體重的每日熱量攝取建議", color: "border-green-200 bg-green-50" },
        { label: "🔵 增加體重", kcal: result.weightGain, description: "每日增加 500 大卡，搭配重量訓練增肌", color: "border-blue-200 bg-blue-50" },
      ]
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 md:text-4xl">🔥 每日卡路里計算器</h1>
        <p className="text-neutral-600">採用 Mifflin-St Jeor 公式計算基礎代謝率 (BMR)，再依活動量估算每日總熱量需求 (TDEE)。</p>
      </div>

      <div className={cardClass}>
        <div>
          <label className={labelClass}>性別</label>
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
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { id: "age", label: "年齡", value: age, setter: setAge, unit: "歲" },
            { id: "height", label: "身高", value: height, setter: setHeight, unit: "cm" },
            { id: "weight", label: "體重", value: weight, setter: setWeight, unit: "kg" },
          ].map(({ id, label, value, setter, unit }) => (
            <div key={id}>
              <label htmlFor={id} className={labelClass}>
                {label}
              </label>
              <div className="relative">
                <input
                  id={id}
                  type="number"
                  value={value}
                  onChange={(e) => {
                    setter(e.target.value);
                    setCalculated(false);
                  }}
                  className={`${inputClass} pr-10`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">{unit}</span>
              </div>
            </div>
          ))}
        </div>

        <div>
          <label className={labelClass}>每日活動量</label>
          <div className="space-y-2">
            {ACTIVITY_LEVELS.map((level) => (
              <button
                key={level.value}
                onClick={() => {
                  setActivity(level.value);
                  setCalculated(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                  activity === level.value ? "border-primary bg-zumthor" : "border-neutral-300 hover:border-primary/50"
                }`}
              >
                <div>
                  <span className="text-sm font-medium">{level.label}</span>
                  <span className="ml-2 text-xs text-neutral-500">— {level.description}</span>
                </div>
                <span className="ml-2 shrink-0 text-xs text-neutral-500">×{level.multiplier}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={handleCalculate} className={primaryButtonClass}>
            計算卡路里需求
          </button>
          <button onClick={handleReset} className={secondaryButtonClass}>
            重置
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-neutral-200 p-5 text-center">
              <p className="mb-1 text-sm text-neutral-500">基礎代謝率 (BMR)</p>
              <p className="text-4xl font-bold tabular-nums text-neutral-800">{result.bmr.toLocaleString()}</p>
              <p className="mt-1 text-sm text-neutral-500">大卡/天</p>
            </div>
            <div className="rounded-xl border border-primary/30 bg-zumthor p-5 text-center">
              <p className="mb-1 text-sm text-neutral-500">每日總熱量 (TDEE)</p>
              <p className="text-4xl font-bold tabular-nums text-primary">{result.tdee.toLocaleString()}</p>
              <p className="mt-1 text-sm text-neutral-500">大卡/天</p>
            </div>
          </div>

          <div className={cardClass}>
            <h2 className="text-lg font-bold text-neutral-800">不同目標建議攝取量</h2>
            <div className="space-y-3">
              {goals.map((g) => (
                <div key={g.label} className={`flex items-center justify-between rounded-xl border p-4 ${g.color}`}>
                  <div>
                    <p className="text-sm font-semibold text-neutral-800">{g.label}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{g.description}</p>
                  </div>
                  <span className="ml-4 shrink-0 text-xl font-bold tabular-nums text-neutral-800">
                    {g.kcal.toLocaleString()} <span className="text-sm font-normal">大卡</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm">
        <p className="font-semibold text-neutral-800">計算公式說明</p>
        <p className="text-neutral-600">
          <strong>BMR</strong>（基礎代謝率）= 靜止時身體維持基本功能所需熱量，採用 Mifflin-St Jeor 公式計算。
        </p>
        <p className="text-neutral-600">
          <strong>TDEE</strong>（每日總熱量消耗）= BMR × 活動係數，代表考量活動量後的每日總熱量需求。
        </p>
      </div>

      <p className={disclaimerClass}>⚠️ 本工具僅供參考，不構成醫療建議。個人熱量需求因體質而異，如有健康疑慮請諮詢醫師或營養師。</p>
    </div>
  );
}
