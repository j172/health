"use client";

import { useMemo, useState } from "react";
import { secondaryButtonClass } from "@/components/Tools/toolStyles";

interface Question {
  id: string;
  text: string;
  options: { label: string; value: number }[];
}

const questions: Question[] = [
  {
    id: "duration",
    text: "過去一個月，您平均每晚實際睡幾小時？",
    options: [
      { label: "7 小時以上", value: 0 },
      { label: "6–7 小時", value: 1 },
      { label: "5–6 小時", value: 2 },
      { label: "不足 5 小時", value: 3 },
    ],
  },
  {
    id: "quality",
    text: "整體來說，您對過去一個月的睡眠品質滿意度如何？",
    options: [
      { label: "非常好", value: 0 },
      { label: "還算好", value: 1 },
      { label: "不太好", value: 2 },
      { label: "很不好", value: 3 },
    ],
  },
  {
    id: "latency",
    text: "您躺下後通常需要多久才能入睡？",
    options: [
      { label: "15 分鐘以內", value: 0 },
      { label: "15–30 分鐘", value: 1 },
      { label: "30–60 分鐘", value: 2 },
      { label: "超過 60 分鐘", value: 3 },
    ],
  },
  {
    id: "wakeup",
    text: "您每週有幾次在夜裡或清晨提早醒來、無法再入睡？",
    options: [
      { label: "幾乎沒有", value: 0 },
      { label: "每週 1–2 次", value: 1 },
      { label: "每週 3–4 次", value: 2 },
      { label: "每週 5 次以上", value: 3 },
    ],
  },
  {
    id: "dysfunction",
    text: "在過去一個月，白天您有多難保持清醒與專注？",
    options: [
      { label: "完全不困難", value: 0 },
      { label: "偶爾困難", value: 1 },
      { label: "經常困難", value: 2 },
      { label: "非常困難", value: 3 },
    ],
  },
  {
    id: "routine",
    text: "您的就寢時間是否規律？",
    options: [
      { label: "非常規律（每天差異 ≤ 30 分鐘）", value: 0 },
      { label: "大致規律", value: 1 },
      { label: "有些不規律", value: 2 },
      { label: "完全不規律", value: 3 },
    ],
  },
  {
    id: "devices",
    text: "您睡前 1 小時內使用手機 / 電腦的頻率？",
    options: [
      { label: "幾乎不用", value: 0 },
      { label: "偶爾（每週 1–2 次）", value: 1 },
      { label: "經常（每週 3–5 次）", value: 2 },
      { label: "幾乎每天", value: 3 },
    ],
  },
];

interface SleepResult {
  score: number;
  level: string;
  levelColor: string;
  bgColor: string;
  tips: string[];
}

/** Simplified PSQI (匹茲堡睡眠品質量表) scoring, normalized to a 0–21 reference score. */
function getSleepResult(answers: Record<string, number>): SleepResult {
  const score = Object.values(answers).reduce((a, b) => a + b, 0);
  const maxScore = questions.length * 3;
  const normalized = Math.round((score / maxScore) * 21);

  if (normalized <= 5) {
    return {
      score: normalized,
      level: "睡眠良好",
      levelColor: "text-green-600",
      bgColor: "bg-green-50",
      tips: ["繼續維持規律的作息時間", "保持臥室涼爽、黑暗且安靜的環境", "維持每日 7–9 小時睡眠"],
    };
  }
  if (normalized <= 10) {
    return {
      score: normalized,
      level: "睡眠輕微困擾",
      levelColor: "text-yellow-600",
      bgColor: "bg-yellow-50",
      tips: ["建立固定的睡前放鬆儀式（閱讀、冥想、輕音樂）", "避免睡前 4 小時攝取咖啡因", "睡前 1 小時停止使用手機與平板", "若在床上超過 20 分鐘仍無法入睡，起來做輕緩活動再試"],
    };
  }
  if (normalized <= 15) {
    return {
      score: normalized,
      level: "睡眠品質欠佳",
      levelColor: "text-orange-600",
      bgColor: "bg-orange-50",
      tips: ["採用 CBT-I（失眠認知行為治療）方法，如限制睡眠時間、刺激控制", "記錄睡眠日記，追蹤睡眠模式", "避免白天補眠超過 20 分鐘", "考慮諮詢睡眠專科醫師評估是否有睡眠呼吸中止症", "固定起床時間，即使週末也不例外"],
    };
  }
  return {
    score: normalized,
    level: "睡眠障礙",
    levelColor: "text-red-600",
    bgColor: "bg-red-50",
    tips: ["🚨 建議儘快就醫，諮詢睡眠科或精神科進行正式評估", "可能需要多頻道睡眠儀 (PSG) 檢查評估睡眠呼吸中止症", "長期睡眠障礙與心血管疾病、憂鬱症風險相關，請積極治療", "避免自行服用助眠藥物或酒精助眠"],
  };
}

export default function SleepAssessment() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const result = useMemo<SleepResult | null>(() => {
    if (!submitted || Object.keys(answers).length < questions.length) return null;
    return getSleepResult(answers);
  }, [answers, submitted]);

  const progress = (Object.keys(answers).length / questions.length) * 100;

  const handleSubmit = () => {
    if (Object.keys(answers).length < questions.length) return;
    setSubmitted(true);
  };

  const handleReset = () => {
    setAnswers({});
    setSubmitted(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 md:text-4xl">😴 睡眠品質評估</h1>
        <p className="text-neutral-600">基於 PSQI 量表 7 個面向，評估您的睡眠狀況並提供科學化睡眠衛生改善建議。</p>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-neutral-500">
          <span>
            已回答 {Object.keys(answers).length} / {questions.length} 題
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="rounded-none bg-blue-50 p-4 text-sm text-neutral-600">
        <p>💡 若有使用 Apple Watch 或 iPhone「健康」App 的睡眠追蹤功能，可先查看其記錄的平均睡眠時數與入睡時間，回答第 1、3 題時會更準確。</p>
      </div>

      {!submitted &&
        questions.map((q, idx) => (
          <div key={q.id} className="space-y-2">
            <p className="text-sm font-medium text-neutral-800">
              <span className="text-neutral-500">{idx + 1}. </span>
              {q.text}
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {q.options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.value }))}
                  className={`rounded-none border px-3 py-2 text-left text-sm transition-all ${
                    answers[q.id] === opt.value ? "border-primary bg-zumthor font-medium text-primary" : "border-neutral-300 hover:border-primary/50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}

      {!submitted && (
        <button
          onClick={handleSubmit}
          disabled={Object.keys(answers).length < questions.length}
          className="w-full rounded-none bg-primary py-3 text-base font-semibold text-white transition-colors hover:bg-primaryho disabled:cursor-not-allowed disabled:opacity-50"
        >
          查看評估結果
        </button>
      )}

      {result && (
        <div className="space-y-4">
          <div className={`${result.bgColor} space-y-3 rounded-none border border-neutral-200 p-5`}>
            <div className="space-y-1 text-center">
              <p className="text-xs text-neutral-500">PSQI 參考分數（0–21）</p>
              <p className="text-5xl font-bold tabular-nums text-neutral-800">{result.score}</p>
              <p className={`text-lg font-semibold ${result.levelColor}`}>{result.level}</p>
            </div>

            <div className="space-y-1.5 pt-2">
              <p className="text-sm font-medium text-neutral-800">改善建議：</p>
              {result.tips.map((tip, i) => (
                <p key={i} className="text-sm text-neutral-600">
                  • {tip}
                </p>
              ))}
            </div>
          </div>

          <div className="space-y-1 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
            <p>本評估基於匹茲堡睡眠品質量表（PSQI）簡化版，分數僅供參考，不能取代專業醫療評估。</p>
          </div>

          <button onClick={handleReset} className={secondaryButtonClass + " w-full"}>
            重新評估
          </button>
        </div>
      )}
    </div>
  );
}
