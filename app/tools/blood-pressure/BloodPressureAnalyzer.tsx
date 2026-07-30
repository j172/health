"use client";

import { useMemo, useState } from "react";
import { inputClass, labelClass, primaryButtonClass } from "@/components/Tools/toolStyles";

interface BPRecord {
  systolic: number;
  diastolic: number;
  pulse?: number;
  time: string;
}

interface BPResult {
  category: string;
  categoryColor: string;
  bgColor: string;
  description: string;
  suggestion: string;
  mapValue: number;
  pulsePressure?: number;
}

/** 依 2023 ESH 高血壓指南（與台灣照護指南相符）分類。 */
function classifyBP(systolic: number, diastolic: number): BPResult {
  const map = Math.round(((2 * diastolic + systolic) / 3) * 10) / 10;
  const pulsePressure = systolic - diastolic;

  const classify = (): { category: string; color: string; bg: string; desc: string; sug: string } => {
    if (systolic < 90 || diastolic < 60) {
      return { category: "低血壓", color: "text-blue-600", bg: "bg-blue-50", desc: "收縮壓低於 90 mmHg 或舒張壓低於 60 mmHg，可能出現頭暈、乏力等症狀。", sug: "請增加水分與鹽分攝取，若症狀持續應諮詢醫師，排除心臟或內分泌問題。" };
    }
    if (systolic < 120 && diastolic < 80) {
      return { category: "正常血壓", color: "text-green-600", bg: "bg-green-50", desc: "血壓在理想範圍，心血管健康狀態良好。", sug: "維持健康飲食（DASH 飲食法）、規律運動與良好睡眠，每年定期量測血壓。" };
    }
    if (systolic < 130 && diastolic < 85) {
      return { category: "正常偏高", color: "text-lime-600", bg: "bg-lime-50", desc: "血壓略高於理想值，屬於灰色地帶，需持續監測。", sug: "建議減少鈉鹽攝取（每日 <5g）、戒菸、減重，並增加有氧運動頻率。" };
    }
    if (systolic < 140 && diastolic < 90) {
      return { category: "高血壓前期", color: "text-yellow-600", bg: "bg-yellow-50", desc: "血壓持續偏高，屬高血壓前期，若不積極調整，未來罹患高血壓風險較高。", sug: "積極進行生活型態改善：低鈉飲食、增加運動量、控制體重、限制飲酒。" };
    }
    if (systolic < 160 && diastolic < 100) {
      return { category: "第一期高血壓", color: "text-orange-600", bg: "bg-orange-50", desc: "確診第一期高血壓，建議諮詢醫師評估是否需要藥物治療。", sug: "請儘速就醫諮詢，配合生活型態改善，每月定期量測血壓並記錄。" };
    }
    if (systolic < 180 && diastolic < 110) {
      return { category: "第二期高血壓", color: "text-red-500", bg: "bg-red-50", desc: "第二期高血壓，心血管疾病風險顯著增加，建議積極藥物治療。", sug: "請立即就醫，在醫師指導下進行藥物治療並嚴格控制飲食。" };
    }
    return { category: "急重症高血壓", color: "text-red-700", bg: "bg-red-100", desc: "血壓達急重症標準（≥180/110 mmHg），可能出現頭痛、視力模糊、胸痛等危險症狀。", sug: "🚨 請立即就醫或撥打 119！不要等待，急重症高血壓可能導致腦中風或心臟病。" };
  };

  const c = classify();
  return { category: c.category, categoryColor: c.color, bgColor: c.bg, description: c.desc, suggestion: c.sug, mapValue: map, pulsePressure };
}

export default function BloodPressureAnalyzer() {
  const [records, setRecords] = useState<BPRecord[]>([]);
  const [systolic, setSystolic] = useState("120");
  const [diastolic, setDiastolic] = useState("80");
  const [pulse, setPulse] = useState("72");

  const addRecord = () => {
    const s = parseInt(systolic);
    const d = parseInt(diastolic);
    const p = parseInt(pulse);
    if (isNaN(s) || isNaN(d) || s < 50 || s > 300 || d < 30 || d > 200 || s <= d) return;
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    setRecords((prev) => [...prev.slice(-6), { systolic: s, diastolic: d, pulse: isNaN(p) ? undefined : p, time }]);
  };

  const latestResult = useMemo<BPResult | null>(() => {
    if (records.length === 0) return null;
    const last = records[records.length - 1];
    return classifyBP(last.systolic, last.diastolic);
  }, [records]);

  const avgResult = useMemo<BPResult | null>(() => {
    if (records.length < 2) return null;
    const s = Math.round(records.reduce((a, r) => a + r.systolic, 0) / records.length);
    const d = Math.round(records.reduce((a, r) => a + r.diastolic, 0) / records.length);
    return classifyBP(s, d);
  }, [records]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 md:text-4xl">🩺 血壓分析器</h1>
        <p className="text-neutral-600">依 2023 ESH 高血壓指南分類血壓等級，支援多次記錄與平均值分析。</p>
      </div>

      <div className="rounded-xl bg-orange-50 p-4 text-sm text-neutral-600">
        <p className="mb-1 font-medium text-neutral-800">📋 量測建議</p>
        <p>• 靜坐 5 分鐘後量測，雙腳平放地面，上臂與心臟等高</p>
        <p>• 早晨服藥前、晚間睡前各量一次，連續測量 7 天取平均</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="bp-systolic" className={labelClass}>
            收縮壓 (mmHg)
          </label>
          <input id="bp-systolic" type="number" value={systolic} onChange={(e) => setSystolic(e.target.value)} min="50" max="300" className={inputClass} />
        </div>
        <div>
          <label htmlFor="bp-diastolic" className={labelClass}>
            舒張壓 (mmHg)
          </label>
          <input id="bp-diastolic" type="number" value={diastolic} onChange={(e) => setDiastolic(e.target.value)} min="30" max="200" className={inputClass} />
        </div>
        <div>
          <label htmlFor="bp-pulse" className={labelClass}>
            心率 (可選)
          </label>
          <input id="bp-pulse" type="number" value={pulse} onChange={(e) => setPulse(e.target.value)} min="30" max="200" className={inputClass} />
        </div>
      </div>

      <button onClick={addRecord} className={primaryButtonClass}>
        新增量測記錄
      </button>

      {records.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-800">量測記錄</h3>
            <button onClick={() => setRecords([])} className="text-xs text-neutral-500 hover:text-red-600">
              清除
            </button>
          </div>
          <div className="space-y-1.5">
            {records.map((r, i) => {
              const res = classifyBP(r.systolic, r.diastolic);
              return (
                <div key={i} className={`${res.bgColor} flex items-center justify-between rounded-lg px-3 py-2 text-sm`}>
                  <span className="text-xs text-neutral-500">{r.time}</span>
                  <span className="font-semibold text-neutral-800">
                    {r.systolic}/{r.diastolic} mmHg
                  </span>
                  {r.pulse && <span className="text-xs text-neutral-500">♥ {r.pulse}</span>}
                  <span className={`text-xs font-medium ${res.categoryColor}`}>{res.category}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {latestResult && (
        <div className={`${latestResult.bgColor} space-y-3 rounded-xl border border-neutral-200 p-5`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-neutral-500">最新量測結果</p>
              <p className={`text-2xl font-bold ${latestResult.categoryColor}`}>{latestResult.category}</p>
            </div>
            <div className="text-right text-xs text-neutral-500">
              <p>平均動脈壓：{latestResult.mapValue} mmHg</p>
              {latestResult.pulsePressure !== undefined && <p>脈壓差：{latestResult.pulsePressure} mmHg</p>}
            </div>
          </div>
          <p className="text-sm text-neutral-800">{latestResult.description}</p>
          <p className="text-sm text-neutral-600">💡 {latestResult.suggestion}</p>
        </div>
      )}

      {avgResult && records.length >= 2 && (
        <div className="space-y-1 rounded-lg bg-neutral-50 p-4 text-sm">
          <p className="font-medium text-neutral-800">
            {records.length} 次量測平均：<span className={avgResult.categoryColor}>{avgResult.category}</span>
          </p>
          <p className="text-xs text-neutral-500">連續多次量測平均值更能準確反映真實血壓狀態。</p>
        </div>
      )}

      <div className="space-y-1 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        <p className="mb-2 font-medium text-neutral-800">血壓分類參考（2023 ESH 指南）</p>
        {[["正常", "< 120 / < 80"], ["正常偏高", "120–129 / 80–84"], ["高血壓前期", "130–139 / 85–89"], ["第一期高血壓", "140–159 / 90–99"], ["第二期高血壓", "≥ 160 / ≥ 100"]].map(([label, range]) => (
          <div key={label} className="flex justify-between">
            <span>{label}</span>
            <span className="font-medium text-neutral-800">{range}</span>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-neutral-500">⚠️ 本工具不能取代血壓計量測，如有持續偏高請就醫確認。</p>
    </div>
  );
}
