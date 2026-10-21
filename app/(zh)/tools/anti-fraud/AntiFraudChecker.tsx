"use client";

import { useState } from "react";

type CheckStatus = "matched" | "not-listed" | "invalid";

interface DomainHit {
  domain: string;
  source: string;
  siteNature: string | null;
  reportedYearMonth: string | null;
  /** 165027/160055 的自由文字說明（沒有「網站性質」分類時才有值，見 issue #567）。 */
  fraudDescription: string | null;
}

interface CheckResponse {
  status: CheckStatus;
  normalizedHost: string | null;
  hits: DomainHit[];
  lastSyncedAt: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  police_176455: "內政部警政署 165 反詐騙諮詢專線",
  moda_165027: "數位發展部 詐騙網域停止解析清單",
  police_160055: "內政部警政署 假投資（博弈）網站（歷史資料）",
};

/**
 * Formats this tool's two "when" shapes (see FraudDomainRecord's doc
 * comment in lib/server/antiFraud/sources/police176455.ts):
 *   - 176455's 民國年月 (4-5 digits, e.g. "11509") -> "民國115年09月"
 *   - 165027/160055's Gregorian YYYYMMDD (8 digits, e.g. "20261008") ->
 *     "2026/10/08"
 * Anything else is shown as-is rather than guessed, so real data is never
 * silently swallowed by a format mismatch.
 */
function formatReportedYearMonth(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const ymd = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  if (ymd) return `${ymd[1]}/${ymd[2]}/${ymd[3]}`;
  const rocYm = /^(\d{2,3})(\d{2})$/.exec(trimmed);
  if (rocYm) return `民國${rocYm[1]}年${rocYm[2]}月`;
  return raw;
}

function formatLastSyncedAt(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Taipei",
  }).format(date);
}

export default function AntiFraudChecker() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCheck = async () => {
    const value = input.trim();
    if (!value) return;

    setLoading(true);
    setErrorMessage(null);
    setResult(null);

    try {
      const response = await fetch(`/api/anti-fraud/check?url=${encodeURIComponent(value)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorMessage(body?.error || "查詢失敗，請稍後再試");
        return;
      }
      const data: CheckResponse = await response.json();
      setResult(data);
    } catch {
      setErrorMessage("查詢失敗，請確認網路連線後再試一次");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setInput("");
    setResult(null);
    setErrorMessage(null);
  };

  const lastUpdatedLabel = result ? formatLastSyncedAt(result.lastSyncedAt) : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">🔍 防詐騙查詢</h1>
        <p className="text-neutral-600 dark:text-slate-300">
          貼上收到的可疑網址，查詢這個網域是否已被內政部警政署、數位發展部列為涉詐並停止解析。本工具不會記錄、儲存或回傳您查詢過的任何網址。
        </p>
      </div>

      <div className="space-y-5 rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label htmlFor="anti-fraud-url" className="mb-2 block text-sm font-medium text-neutral-700 dark:text-slate-200">
            可疑網址或網域
          </label>
          <input
            id="anti-fraud-url"
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setResult(null);
              setErrorMessage(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCheck();
            }}
            placeholder="例：https://example.com/login 或 example.com"
            className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCheck}
            disabled={loading || !input.trim()}
            className="flex-1 rounded-lg bg-primary py-3 text-base font-semibold text-white transition-colors hover:bg-primaryho disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "查詢中…" : "查詢"}
          </button>
          <button
            onClick={handleReset}
            className="rounded-lg border border-neutral-300 px-6 py-3 text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            重置
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          ⚠️ {errorMessage}
        </div>
      )}

      {result && result.status === "invalid" && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          ⚠️ 看起來不是有效的網址或網域，請確認格式後再試一次（例如：example.com 或 https://example.com/path）。
        </div>
      )}

      {result && result.status === "matched" && (
        <div className="space-y-4 rounded-xl border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950/30">
          <div className="text-center">
            <p className="text-xl font-bold text-red-700 dark:text-red-300">⚠️ 已列為涉詐並停止解析</p>
            <p className="mt-1 break-all text-sm text-red-600 dark:text-red-400">{result.normalizedHost}</p>
          </div>

          <div className="space-y-3">
            {result.hits.map((hit, index) => (
              <div
                key={`${hit.source}-${hit.domain}-${index}`}
                className="rounded-lg bg-white p-4 text-sm dark:bg-slate-900"
              >
                <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                  <dt className="text-neutral-500 dark:text-slate-400">比對網域</dt>
                  <dd className="break-all font-medium text-neutral-800 dark:text-slate-100">{hit.domain}</dd>
                  {hit.siteNature ? (
                    <>
                      <dt className="text-neutral-500 dark:text-slate-400">網站性質</dt>
                      <dd className="text-neutral-800 dark:text-slate-100">{hit.siteNature}</dd>
                    </>
                  ) : hit.fraudDescription ? (
                    <>
                      <dt className="text-neutral-500 dark:text-slate-400">說明</dt>
                      <dd className="text-neutral-800 dark:text-slate-100">{hit.fraudDescription}</dd>
                    </>
                  ) : (
                    <>
                      <dt className="text-neutral-500 dark:text-slate-400">網站性質</dt>
                      <dd className="text-neutral-800 dark:text-slate-100">未標註</dd>
                    </>
                  )}
                  <dt className="text-neutral-500 dark:text-slate-400">停止解析時間</dt>
                  <dd className="text-neutral-800 dark:text-slate-100">
                    {formatReportedYearMonth(hit.reportedYearMonth) || "未標註"}
                  </dd>
                  <dt className="text-neutral-500 dark:text-slate-400">資料來源</dt>
                  <dd className="text-neutral-800 dark:text-slate-100">{SOURCE_LABELS[hit.source] || hit.source}</dd>
                </dl>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-red-700 dark:text-red-300">
            請勿點擊此網址或提供個人資料、匯款。如已受騙，請立即撥打 165 反詐騙諮詢專線。
          </p>
        </div>
      )}

      {result && result.status === "not-listed" && (
        <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-lg font-semibold text-neutral-800 dark:text-slate-100">目前不在涉詐網域清單上</p>
          {result.normalizedHost && (
            <p className="break-all text-sm text-neutral-500 dark:text-slate-400">{result.normalizedHost}</p>
          )}
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            ⚠️ 不在清單上不代表安全，請撥 165 查證。
          </p>
          {result.normalizedHost && (
            <div className="pt-2">
              <a
                href={`https://transparencyreport.google.com/safe-browsing/search?url=${encodeURIComponent(result.normalizedHost)}&hl=zh_TW`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3.5 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
              >
                🛡️ 前往 Google 透明度報告（Safe Browsing）交叉查驗此網域（另開新視窗）↗
              </a>
            </div>
          )}
          <p className="sr-only">
          </p>
        </div>
      )}

      {lastUpdatedLabel && (
        <p className="text-center text-xs text-neutral-500 dark:text-slate-400">清單最後更新日期：{lastUpdatedLabel}</p>
      )}

      <p className="px-4 text-center text-xs text-neutral-500 dark:text-slate-400">
        ⚠️
        本工具僅比對內政部警政署、數位發展部公開之涉詐網域清單，查詢結果僅供參考，不構成法律或投資建議。可疑電話或 LINE ID 請改撥
        165 查證。
      </p>
    </div>
  );
}
