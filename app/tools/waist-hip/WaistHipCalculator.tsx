"use client";

import { useMemo, useState } from "react";
import { disclaimerClass, inputClass, labelClass, primaryButtonClass, toggleButtonClass } from "@/components/Tools/toolStyles";

type Gender = "male" | "female";

interface WHRResult {
  ratio: number;
  riskLevel: string;
  riskColor: string;
  description: string;
  suggestion: string;
  waistOk: boolean;
}

/**
 * WHO 腰臀比風險分類
 * 男性：<0.90 低風險；0.90–0.99 中等；≥1.0 高風險
 * 女性：<0.80 低風險；0.80–0.84 中等；≥0.85 高風險
 * 腹圍標準：男 <90cm，女 <80cm（台灣衛福部）
 */
function calculateWHR(gender: Gender, waist: number, hip: number, height: number): WHRResult {
  const ratio = Math.round((waist / hip) * 1000) / 1000;
  const waistOk = gender === "male" ? waist < 90 : waist < 80;

  const thresholds =
    gender === "male"
      ? [
          { max: 0.9, level: "低風險", color: "text-green-600", desc: "腰臀比理想，腹部脂肪堆積風險低。", sug: "維持規律運動，尤其是有氧訓練，有助持續保持腰腹線條。" },
          { max: 1.0, level: "中等風險", color: "text-yellow-600", desc: "腰臀比偏高，需留意腹部脂肪，建議增加有氧運動。", sug: "每週至少 150 分鐘中等強度有氧運動，減少精緻碳水攝取。" },
          { max: 999, level: "高風險", color: "text-red-600", desc: "腰臀比超標，腹部肥胖與代謝疾病（心血管、糖尿病）風險顯著提高。", sug: "建議諮詢醫師，評估代謝指標（血糖、血脂），制定減重計畫。" },
        ]
      : [
          { max: 0.8, level: "低風險", color: "text-green-600", desc: "腰臀比理想，體型勻稱，健康風險低。", sug: "持續保持規律運動，並注意骨質密度維護。" },
          { max: 0.85, level: "中等風險", color: "text-yellow-600", desc: "腰臀比略高，腹部脂肪有增加趨勢。", sug: "增加核心肌群訓練，搭配有氧，並減少加工食品攝取。" },
          { max: 999, level: "高風險", color: "text-red-600", desc: "腰臀比超標，建議積極改善生活型態，降低慢性病風險。", sug: "諮詢醫師進行代謝檢查，結合飲食控制與運動計畫。" },
        ];

  const cat = thresholds.find((t) => ratio < t.max) ?? thresholds[thresholds.length - 1];

  const whtr = waist / height;
  const whtrNote = whtr >= 0.5 ? `（身高腰圍比 ${(whtr * 100).toFixed(1)}% ≥ 50%，腹部脂肪偏多）` : "";

  return { ratio, riskLevel: cat.level, riskColor: cat.color, description: cat.desc + whtrNote, suggestion: cat.sug, waistOk };
}

export default function WaistHipCalculator() {
  const [gender, setGender] = useState<Gender>("male");
  const [waist, setWaist] = useState("85");
  const [hip, setHip] = useState("95");
  const [height, setHeight] = useState("170");
  const [calculated, setCalculated] = useState(false);

  const result = useMemo<WHRResult | null>(() => {
    if (!calculated) return null;
    const w = parseFloat(waist);
    const h = parseFloat(hip);
    const ht = parseFloat(height);
    if ([w, h, ht].some((v) => isNaN(v) || v <= 0)) return null;
    return calculateWHR(gender, w, h, ht);
  }, [calculated, gender, waist, hip, height]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 md:text-4xl">📏 腰臀比計算器</h1>
        <p className="text-neutral-600">計算腰臀比（WHR），依 WHO 標準評估腹部肥胖與心血管代謝風險。</p>
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

      <div className="space-y-1 rounded-lg bg-zumthor p-4 text-sm text-neutral-600">
        <p className="font-medium text-neutral-800">📏 量測方式</p>
        <p>
          • <strong>腰圍</strong>：肋骨最低點與髂骨最高點中間位置，平緩呼氣後量測
        </p>
        <p>
          • <strong>臀圍</strong>：臀部最寬處水平量測
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="wh-waist" className={labelClass}>
            腰圍 (cm)
          </label>
          <input
            id="wh-waist"
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
        <div>
          <label htmlFor="wh-hip" className={labelClass}>
            臀圍 (cm)
          </label>
          <input
            id="wh-hip"
            type="number"
            value={hip}
            onChange={(e) => {
              setHip(e.target.value);
              setCalculated(false);
            }}
            min="50"
            max="200"
            className={inputClass}
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="wh-height" className={labelClass}>
            身高 (cm) <span className="text-xs text-neutral-500">用於計算腰身比</span>
          </label>
          <input
            id="wh-height"
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
      </div>

      <button onClick={() => setCalculated(true)} className={primaryButtonClass}>
        計算腰臀比
      </button>

      {result && (
        <div className="space-y-4 rounded-xl border border-neutral-200 p-6">
          <div className="text-center">
            <p className="mb-1 text-sm text-neutral-500">腰臀比 (WHR)</p>
            <p className={`text-5xl font-bold ${result.riskColor}`}>{result.ratio}</p>
            <p className={`mt-2 text-lg font-semibold ${result.riskColor}`}>{result.riskLevel}</p>
          </div>

          {!result.waistOk && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              ⚠️ 您的腰圍超過台灣衛福部建議標準（男性 90cm、女性 80cm），屬於腹部肥胖。
            </div>
          )}

          <div className="space-y-2 rounded-lg bg-neutral-50 p-4">
            <p className="text-sm text-neutral-800">{result.description}</p>
            <p className="text-sm text-neutral-600">💡 {result.suggestion}</p>
          </div>

          <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500">
            <p className="mb-2 font-medium">WHO 腰臀比標準 — {gender === "male" ? "男性" : "女性"}</p>
            <div className="flex flex-wrap gap-2">
              {(gender === "male"
                ? [["低風險", "< 0.90"], ["中等", "0.90–0.99"], ["高風險", "≥ 1.00"]]
                : [["低風險", "< 0.80"], ["中等", "0.80–0.84"], ["高風險", "≥ 0.85"]]
              ).map(([label, range]) => (
                <span key={label} className="rounded bg-neutral-100 px-2 py-0.5">
                  {label}: {range}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className={disclaimerClass}>⚠️ 本工具結果僅供健康參考，不能取代醫師診斷。</p>
    </div>
  );
}
