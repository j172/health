"use client";

import { useMemo, useState } from "react";
import { secondaryButtonClass } from "@/components/Tools/toolStyles";

/**
 * 知覺壓力量表 PSS-10（正體中文改編版）
 * Cohen, Kamarck & Mermelstein (1983)
 */
const PSS_QUESTIONS = [
  { id: 1, text: "在過去一個月，您有多少頻率對某些事情感到不安，因為它的發生是出乎意料的？", reversed: false },
  { id: 2, text: "在過去一個月，您有多少頻率感到無法掌控生活中的重要事物？", reversed: false },
  { id: 3, text: "在過去一個月，您有多少頻率感到緊張和有壓力？", reversed: false },
  { id: 4, text: "在過去一個月，您有多少頻率成功地應對日常生活中令人煩惱的事情？", reversed: true },
  { id: 5, text: "在過去一個月，您有多少頻率感到自己有效地處理生活中的重要改變？", reversed: true },
  { id: 6, text: "在過去一個月，您有多少頻率對自己應對個人問題的能力感到有信心？", reversed: true },
  { id: 7, text: "在過去一個月，您有多少頻率感到事情都按照您希望的方式進行？", reversed: true },
  { id: 8, text: "在過去一個月，您有多少頻率感到無法應付所有必須做的事情？", reversed: false },
  { id: 9, text: "在過去一個月，您有多少頻率能夠控制生活中令人煩惱的事情？", reversed: true },
  { id: 10, text: "在過去一個月，您有多少頻率感到困難多到讓您無法克服？", reversed: false },
] as const;

const LIKERT = [
  { label: "從不", value: 0 },
  { label: "很少", value: 1 },
  { label: "有時", value: 2 },
  { label: "常常", value: 3 },
  { label: "總是", value: 4 },
];

interface StressResult {
  total: number;
  level: string;
  levelColor: string;
  bgColor: string;
  description: string;
  copingStrategies: string[];
}

function getStressResult(answers: Record<number, number>): StressResult {
  const total = PSS_QUESTIONS.reduce((sum, q) => {
    const raw = answers[q.id] ?? 0;
    return sum + (q.reversed ? 4 - raw : raw);
  }, 0);

  if (total <= 13) {
    return {
      total,
      level: "低壓力",
      levelColor: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-50 dark:bg-green-950/40",
      description: "您目前的壓力程度在正常範圍內，整體應對能力良好，生活感受相對平衡。",
      copingStrategies: ["維持現有的健康習慣：規律運動、充足睡眠", "繼續培養正向社交關係與興趣嗜好", "定期進行身心放鬆，如冥想、瑜伽或深呼吸練習"],
    };
  }
  if (total <= 26) {
    return {
      total,
      level: "中度壓力",
      levelColor: "text-yellow-600 dark:text-yellow-400",
      bgColor: "bg-yellow-50 dark:bg-yellow-950/40",
      description: "您正在經歷中等程度的壓力，在高峰期可能影響睡眠、注意力或情緒調節。",
      copingStrategies: [
        "嘗試正念冥想（每日 10 分鐘），有助降低皮質醇水平",
        "建立明確的工作與休息界線，設定優先處理清單",
        "與信任的朋友或家人分享感受，尋求社會支持",
        "保持規律的有氧運動（每週 150 分鐘），有助釋放壓力荷爾蒙",
        "必要時諮詢心理師，學習認知重構技巧",
      ],
    };
  }
  return {
    total,
    level: "高度壓力",
    levelColor: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/40",
    description: "您目前處於高度壓力狀態，長期下去可能增加心血管疾病、焦慮症和憂鬱症的風險，建議積極介入。",
    copingStrategies: [
      "🚨 強烈建議諮詢心理健康專業人員（心理師或精神科醫師）",
      "學習 4-7-8 呼吸法或漸進式肌肉放鬆法應對急性壓力",
      "暫時減少接觸壓力來源（新聞、社群媒體），保護心理空間",
      "確保每晚 7–8 小時睡眠，不足睡眠會急劇惡化壓力感受",
      "考慮正念減壓療程（MBSR）或認知行為治療（CBT）",
      "向家人、朋友或心理諮詢熱線尋求支持（台灣：1925 安心專線）",
    ],
  };
}

export default function StressAssessment() {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const answeredCount = Object.keys(answers).length;
  const progress = (answeredCount / PSS_QUESTIONS.length) * 100;

  const result = useMemo<StressResult | null>(() => {
    if (!submitted || answeredCount < PSS_QUESTIONS.length) return null;
    return getStressResult(answers);
  }, [answers, submitted, answeredCount]);

  const handleReset = () => {
    setAnswers({});
    setSubmitted(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">🧠 壓力評估測驗</h1>
        <p className="text-neutral-600 dark:text-slate-300">採用 PSS-10 知覺壓力量表，10 道題目量化壓力程度，提供個人化減壓策略。</p>
      </div>

      <div className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-600 dark:bg-slate-800/60 dark:text-slate-300">
        <p className="mb-1 font-medium text-neutral-800 dark:text-slate-100">📝 注意事項</p>
        <p>
          請根據<strong>過去一個月</strong>的整體感受作答，每題選一個最符合的選項，沒有對錯之分。
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-neutral-500 dark:text-slate-400">
          <span>
            已回答 {answeredCount} / {PSS_QUESTIONS.length} 題
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {!submitted &&
        PSS_QUESTIONS.map((q, idx) => (
          <div key={q.id} className="space-y-2.5">
            <p className="text-sm font-medium leading-relaxed text-neutral-800 dark:text-slate-100">
              <span className="mr-1 text-primary">{idx + 1}.</span>
              {q.text}
            </p>
            <div className="grid grid-cols-5 gap-1">
              {LIKERT.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.value }))}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border py-2 text-xs transition-all ${
                    answers[q.id] === opt.value
                      ? "border-primary bg-zumthor font-semibold text-primary dark:bg-primary/20 dark:border-primary"
                      : "border-neutral-300 text-neutral-500 hover:border-primary/50 dark:border-slate-700 dark:text-slate-400 dark:hover:border-primary/50"
                  }`}
                >
                  <span className="text-base">{opt.value}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

      {!submitted && (
        <button
          onClick={() => setSubmitted(true)}
          disabled={answeredCount < PSS_QUESTIONS.length}
          className="w-full rounded-lg bg-primary py-3 text-base font-semibold text-white transition-colors hover:bg-primaryho disabled:cursor-not-allowed disabled:opacity-50"
        >
          {answeredCount < PSS_QUESTIONS.length ? `還有 ${PSS_QUESTIONS.length - answeredCount} 題未作答` : "查看壓力評估結果"}
        </button>
      )}

      {result && (
        <div className="space-y-4">
          <div className={`${result.bgColor} space-y-3 rounded-xl border border-neutral-200 p-5 dark:border-slate-800`}>
            <div className="space-y-1 text-center">
              <p className="text-xs text-neutral-500 dark:text-slate-400">PSS-10 總分（0–40）</p>
              <p className="text-5xl font-bold tabular-nums text-neutral-800 dark:text-slate-100">{result.total}</p>
              <p className={`text-lg font-semibold ${result.levelColor}`}>{result.level}</p>
            </div>

            <div className="relative mb-4 mt-2 h-3 rounded-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-500">
              <div
                className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-neutral-400 bg-white shadow transition-all dark:border-slate-600"
                style={{ left: `${(result.total / 40) * 100}%`, transform: "translate(-50%, -50%)" }}
              />
            </div>
            <div className="-mt-2 flex justify-between text-xs text-neutral-500 dark:text-slate-400">
              <span>低壓力 (0–13)</span>
              <span>中度 (14–26)</span>
              <span>高壓力 (27–40)</span>
            </div>

            <p className="pt-1 text-sm text-neutral-800 dark:text-slate-200">{result.description}</p>

            <div className="space-y-1.5 pt-1">
              <p className="text-sm font-medium text-neutral-800 dark:text-slate-100">建議應對策略：</p>
              {result.copingStrategies.map((tip, i) => (
                <p key={i} className="text-sm text-neutral-600 dark:text-slate-300">
                  • {tip}
                </p>
              ))}
            </div>
          </div>

          <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 dark:border-slate-800 dark:text-slate-400">
            <p>本評估採用 PSS-10（知覺壓力量表），由 Cohen et al. (1983) 開發，廣泛用於研究與臨床篩查。分數僅供參考，不構成醫療診斷。若長期感到高度壓力，請諮詢心理健康專業人員。</p>
          </div>

          <button onClick={handleReset} className={secondaryButtonClass + " w-full"}>
            重新評估
          </button>
        </div>
      )}
    </div>
  );
}
