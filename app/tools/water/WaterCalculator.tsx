"use client";

/**
 * 每日飲水量計算器
 * 公式：體重(kg)×35ml + 活動量加成((等級-1)×200ml) + 高溫環境加成(+500ml)
 * 參考來源：台灣衛生福利部國民健康署建議
 */

import { useMemo, useState } from "react";

const ACTIVITY_LEVELS = [
  { value: 1, label: "久坐（辦公室、幾乎不運動）" },
  { value: 2, label: "輕量活動（每週 1-3 天輕度運動）" },
  { value: 3, label: "中度活動（每週 3-5 天中強度運動）" },
  { value: 4, label: "高度活動（每週 6-7 天劇烈運動）" },
  { value: 5, label: "非常高強度（每天劇烈運動或勞動工作）" },
] as const;

function calcWaterMl(weight: number, activityLevel: number, hotClimate: boolean): number {
  const base = weight * 35;
  const activityBonus = (activityLevel - 1) * 200;
  const climateBonus = hotClimate ? 500 : 0;
  return Math.round(base + activityBonus + climateBonus);
}

/** Hourly schedule from 07:00 to 21:00 (every 2 hours). */
function buildHourlySchedule(totalMl: number): { time: string; amount: number }[] {
  const hours = [7, 9, 11, 13, 15, 17, 19, 21];
  const perServing = Math.round(totalMl / hours.length);
  return hours.map((h) => ({ time: `${String(h).padStart(2, "0")}:00`, amount: perServing }));
}

export function WaterCalculator() {
  const [weight, setWeight] = useState(65);
  const [activityLevel, setActivityLevel] = useState(2);
  const [hotClimate, setHotClimate] = useState(false);

  const totalMl = useMemo(() => calcWaterMl(weight, activityLevel, hotClimate), [weight, activityLevel, hotClimate]);
  const cups = useMemo(() => Math.ceil(totalMl / 250), [totalMl]);
  const schedule = useMemo(() => buildHourlySchedule(totalMl), [totalMl]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 md:text-4xl">💧 飲水量計算器</h1>
        <p className="text-neutral-600">依體重與活動量計算每日建議飲水量，並提供分段補水時間表。</p>
      </div>

      <section className="space-y-6 rounded-none border border-neutral-200 p-6">
        <h2 className="text-xl font-bold text-neutral-800">輸入您的資訊</h2>

        <div className="space-y-2">
          <label htmlFor="weight-input" className="block text-sm font-medium text-neutral-700">
            體重 <span className="ml-1 text-neutral-500">(kg)</span>
          </label>
          <div className="flex items-center gap-4">
            <input
              id="weight-input"
              type="range"
              min={30}
              max={150}
              step={1}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="w-16 text-right text-lg font-bold tabular-nums text-primary">{weight} kg</span>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="activity-select" className="block text-sm font-medium text-neutral-700">
            日常活動量
          </label>
          <select
            id="activity-select"
            value={activityLevel}
            onChange={(e) => setActivityLevel(Number(e.target.value))}
            className="w-full rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-primary focus:outline-none"
          >
            {ACTIVITY_LEVELS.map((lvl) => (
              <option key={lvl.value} value={lvl.value}>
                {lvl.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="hot-climate-toggle"
            type="checkbox"
            checked={hotClimate}
            onChange={(e) => setHotClimate(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <label htmlFor="hot-climate-toggle" className="cursor-pointer text-sm text-neutral-700">
            高溫或出汗較多的環境 <span className="ml-1 text-xs text-neutral-500">（+500 ml）</span>
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-none border border-primary/20 bg-zumthor p-6">
        <h2 className="text-xl font-bold text-neutral-800">每日建議飲水量</h2>

        <div className="flex flex-wrap gap-4">
          <div className="min-w-[120px] flex-1 rounded-none border border-neutral-200 bg-white p-4 text-center">
            <p className="text-3xl font-extrabold tabular-nums text-primary">{totalMl.toLocaleString()}</p>
            <p className="mt-1 text-sm text-neutral-500">毫升 (ml)</p>
          </div>
          <div className="min-w-[120px] flex-1 rounded-none border border-neutral-200 bg-white p-4 text-center">
            <p className="text-3xl font-extrabold tabular-nums text-primary">{(totalMl / 1000).toFixed(1)}</p>
            <p className="mt-1 text-sm text-neutral-500">公升 (L)</p>
          </div>
          <div className="min-w-[120px] flex-1 rounded-none border border-neutral-200 bg-white p-4 text-center">
            <p className="text-3xl font-extrabold tabular-nums text-primary">{cups}</p>
            <p className="mt-1 text-sm text-neutral-500">杯（250 ml/杯）</p>
          </div>
        </div>

        <p className="text-xs text-neutral-500">* 以上為參考值，實際需求依個人身體狀況、疾病史有所不同，建議諮詢醫師或營養師。</p>
      </section>

      <section className="rounded-none border border-neutral-200 p-6">
        <h2 className="mb-4 text-lg font-bold text-neutral-800">建議補水時間表</h2>
        <ul className="space-y-2">
          {schedule.map((slot) => (
            <li key={slot.time} className="flex items-center justify-between border-b border-neutral-100 py-2 text-sm last:border-0">
              <span className="font-medium tabular-nums text-neutral-800">{slot.time}</span>
              <span className="flex items-center gap-1 text-neutral-500">
                <span aria-hidden="true">💧</span>
                {slot.amount} ml
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-neutral-500">早晨起床後與睡前各補充一杯水效果更佳。</p>
      </section>

      <section className="space-y-2 rounded-none border border-blue-200 bg-blue-50 p-5">
        <h2 className="text-base font-bold text-blue-800">💡 補水小知識</h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-blue-700">
          <li>口渴時代表身體已輕度缺水，應主動規律補水</li>
          <li>咖啡、茶、酒精有利尿作用，飲用後需額外補水</li>
          <li>蔬菜水果含水量高達 80-95%，可計入每日攝取</li>
          <li>尿液呈淡黃色為水分充足的依據</li>
        </ul>
      </section>
    </div>
  );
}
