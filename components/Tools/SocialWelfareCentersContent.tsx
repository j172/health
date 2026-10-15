"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { COUNTY_1999_LIST } from "@/lib/server/hotlines/county1999";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import {
  QUICK_EXIT_URL,
  SITUATIONS,
  SOCIAL_WORKER_VISIT_STEPS,
  SOCIAL_WORKER_VISIT_SOURCE,
  filterSocialWelfareCenters,
  resolveNearestCounty,
  type SocialWelfareCenter,
} from "@/components/Tools/socialWelfareCentersShared";

export type { SocialWelfareCenter };

/**
 * issue #603 — this entire page exists to help someone who may be trying to
 * get help without a person sharing their device finding out. Two hard
 * rules follow from that, enforced structurally (not just by convention):
 *
 *   1. Nothing on this page may ever write to browser storage or cookies —
 *      not for the selected scenario, not for the county/keyword search,
 *      not for anything. See SocialWelfareCentersContent.test.mjs's static
 *      source-text check, which greps this exact file for those APIs and
 *      fails the build if any appear — a stronger guarantee than a runtime
 *      click-spy, since it covers every code path in this file, not just
 *      the ones a test happens to exercise.
 *   2. The quick-exit button (and the global Escape listener below) must
 *      leave no way back via the browser's own "back" button — hence
 *      `location.replace`, never `location.href`/`router.push`.
 *
 * The situational-guidance content and the county/keyword matching logic
 * live in the sibling socialWelfareCentersShared.ts module (plain .ts, no
 * JSX) rather than inline here, purely so they're testable with plain
 * `node --test` — this repo has no React-rendering/DOM test harness (no
 * jsdom, @testing-library/react, etc.) and Node's native TS-stripping
 * loader used by this repo's *.test.mjs files cannot parse JSX, only .ts.
 */

const COUNTY_NAMES = COUNTY_1999_LIST.map((c) => c.name);

export default function SocialWelfareCentersContent({ centers }: { centers: SocialWelfareCenter[] }) {
  const [selectedSituationId, setSelectedSituationId] = useState<string | null>(null);
  const [county, setCounty] = useState("");
  const [keyword, setKeyword] = useState("");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const quickExit = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.replace(QUICK_EXIT_URL);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") quickExit();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [quickExit]);

  const handleLocate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocateError("此裝置或瀏覽器不支援定位，請改用下方選單選擇縣市。");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const nearest = resolveNearestCounty(position.coords.latitude, position.coords.longitude);
        if (nearest) setCounty(nearest);
      },
      () => {
        setLocating(false);
        setLocateError("無法取得目前位置，請改用下方選單選擇縣市。");
      },
      { timeout: 10_000 },
    );
  }, []);

  const filteredCenters = useMemo(
    () => filterSocialWelfareCenters(centers, { county, keyword }),
    [centers, county, keyword],
  );

  const selectedSituation = SITUATIONS.find((s) => s.id === selectedSituationId) || null;

  return (
    <div className="space-y-8">
      {/* 快速離開：固定顯示，點擊或按 Escape 都會立即跳離本頁，且無法用「上一頁」回來。 */}
      <button
        type="button"
        onClick={quickExit}
        className="fixed right-3 top-3 z-50 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-lg transition hover:bg-red-700 active:scale-95"
        aria-label="快速離開本頁（按 Escape 鍵也可以）"
      >
        🚪 快速離開
      </button>

      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">
          🤝 社福中心與社工求助
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">
          不確定遇到的狀況該找誰幫忙？選擇下面最接近您目前情況的描述，看看建議的求助方式；也可以直接查詢住家附近的社福中心。右上角「快速離開」按鈕與
          <kbd className="mx-1 rounded border border-neutral-300 px-1 text-xs dark:border-slate-600">Esc</kbd>
          鍵隨時可以立刻離開本頁。
        </p>
      </div>

      {/* 情境引導 */}
      <section>
        <h2 className="mb-3 text-xl font-bold text-neutral-800 dark:text-slate-100">您目前的狀況比較接近哪一種？</h2>
        <div className="flex flex-wrap gap-2">
          {SITUATIONS.map((situation) => (
            <button
              key={situation.id}
              type="button"
              onClick={() => setSelectedSituationId((prev) => (prev === situation.id ? null : situation.id))}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                selectedSituationId === situation.id
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {situation.emoji} {situation.title}
            </button>
          ))}
        </div>

        {selectedSituation && (
          <div className="mt-4 space-y-4 rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <h3 className="text-lg font-bold text-neutral-800 dark:text-slate-100">
                {selectedSituation.emoji} {selectedSituation.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-slate-300">
                {selectedSituation.description}
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-neutral-700 dark:text-slate-200">建議的求助方式</p>
              <ul className="space-y-1.5 text-sm text-neutral-700 dark:text-slate-300">
                {selectedSituation.steps.map((step, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="shrink-0">•</span>
                    <span>
                      {step.label}
                      {step.href && (
                        <>
                          {" "}
                          <a
                            href={appendOutboundUtm(step.href, {
                              medium: "tool_outbound",
                              campaign: "social_welfare_centers",
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-indigo-600 underline hover:text-indigo-700 dark:text-indigo-400"
                          >
                            {step.href}
                          </a>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {selectedSituation.isAbuseRelated && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="font-semibold">⚠️ 瀏覽紀錄提醒</p>
                <p className="mt-1">
                  如果您擔心同住的人會查看這台裝置的瀏覽紀錄，瀏覽過這個頁面後建議手動清除紀錄：大部分瀏覽器可在「設定」或「隱私權」選單找到「清除瀏覽資料」，或使用快速鍵
                  <kbd className="mx-1 rounded border border-amber-400 px-1">Ctrl</kbd>+
                  <kbd className="mx-1 rounded border border-amber-400 px-1">Shift</kbd>+
                  <kbd className="mx-1 rounded border border-amber-400 px-1">Delete</kbd>
                  開啟清除紀錄的視窗。如果方便，也可以考慮使用無痕／隱私視窗瀏覽，或改用公共場所、信任的親友的裝置查詢。
                </p>
              </div>
            )}

            <p className="text-xs text-neutral-500 dark:text-slate-400">
              官方出處：
              <a
                href={appendOutboundUtm(selectedSituation.officialSource.url, {
                  medium: "tool_outbound",
                  campaign: "social_welfare_centers",
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 underline hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                {selectedSituation.officialSource.label}
              </a>
            </p>
          </div>
        )}
      </section>

      {/* 社工來訪會做什麼 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-xl font-bold text-neutral-800 dark:text-slate-100">🧑‍💼 社工來訪會做什麼？</h2>
        <ol className="space-y-2 text-sm text-neutral-700 dark:text-slate-300">
          {SOCIAL_WORKER_VISIT_STEPS.map((step) => (
            <li key={step.order} className="flex gap-2">
              <span className="shrink-0 font-bold text-indigo-600 dark:text-indigo-400">{step.order}.</span>
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-neutral-500 dark:text-slate-400">
          官方出處：
          <a
            href={appendOutboundUtm(SOCIAL_WORKER_VISIT_SOURCE.url, {
              medium: "tool_outbound",
              campaign: "social_welfare_centers",
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 underline hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            {SOCIAL_WORKER_VISIT_SOURCE.label}
          </a>
        </p>
      </section>

      {/* 社福中心查詢 */}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-xl font-bold text-neutral-800 dark:text-slate-100">📍 找住家附近的社福中心</h2>
        <p className="mb-4 text-sm text-neutral-600 dark:text-slate-300">
          依服務轄區查詢涵蓋您住處的社福中心。這裡的搜尋完全在您的瀏覽器裡進行，不會把您選的縣市或輸入的關鍵字送到任何伺服器。
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="swc-county" className="mb-1 block text-xs font-medium text-neutral-600 dark:text-slate-400">
              縣市
            </label>
            <select
              id="swc-county"
              value={county}
              onChange={(e) => setCounty(e.target.value)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">請選擇縣市</option>
              {COUNTY_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="swc-keyword" className="mb-1 block text-xs font-medium text-neutral-600 dark:text-slate-400">
              鄉鎮市區（選填）
            </label>
            <input
              id="swc-keyword"
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="例：三峽區"
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <button
            type="button"
            onClick={handleLocate}
            disabled={locating}
            className="rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {locating ? "定位中…" : "📡 使用目前位置"}
          </button>
        </div>

        {locateError && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{locateError}</p>}

        <div className="mt-4 space-y-3">
          {!county && (
            <p className="text-sm text-neutral-500 dark:text-slate-400">請先選擇縣市，或使用「使用目前位置」定位。</p>
          )}
          {county && filteredCenters.length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-slate-400">查無符合的社福中心，請確認縣市或鄉鎮市區輸入是否正確。</p>
          )}
          {filteredCenters.map((center, idx) => (
            <div
              key={`${center.name}-${idx}`}
              className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-slate-800"
            >
              <p className="font-semibold text-neutral-800 dark:text-slate-100">{center.name}</p>
              {center.serviceArea && (
                <p className="mt-1 text-neutral-600 dark:text-slate-400">服務轄區：{center.serviceArea}</p>
              )}
              {center.address && <p className="mt-1 text-neutral-600 dark:text-slate-400">地址：{center.address}</p>}
              {center.phone && (
                <p className="mt-1">
                  電話：
                  <a href={`tel:${center.phone.replace(/[^\d+]/g, "")}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
                    {center.phone}
                  </a>
                </p>
              )}
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-neutral-500 dark:text-slate-400">
          資料來源：衛生福利部社會及家庭署「全國社福中心福利服務中心通訊錄」。
        </p>
      </section>
    </div>
  );
}
