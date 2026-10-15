"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import Pagination from "@/components/Tools/Pagination";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import { DEFAULT_PAGE_SIZE, type PageSizeOption } from "@/lib/hooks/usePagination";
import type { BorderFoodRejectionsPage } from "@/lib/server/borderFood/types";

const DATASET_URL = "https://data.gov.tw/dataset/6133";

const inputClass =
  "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const labelClass = "mb-1 block text-xs font-semibold text-neutral-600 dark:text-slate-300";

interface Filters {
  origin: string;
  reason: string;
  from: string;
  to: string;
  q: string;
}

const EMPTY_FILTERS: Filters = { origin: "", reason: "", from: "", to: "", q: "" };

const formatSyncedAt = (iso: string | null): string => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" });
};

/**
 * 「邊境查驗不合格食品」分頁（issue #671，併入 food-safety）。資料為衛福部食藥署
 * 公開的「不符合食品資訊」(data.gov.tw 6133)；依 issue 規定，本分頁不顯示進口商
 * 地址與附圖——這兩個欄位連資料庫都沒有儲存，這裡也沒有任何圖片元素。
 */
export default function BorderFoodRejectionsContent() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // The keyword box is debounced into `filters.q`; the other filters apply immediately.
  const [keywordInput, setKeywordInput] = useState("");
  const appliedKeyword = useRef("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);
  const [data, setData] = useState<BorderFoodRejectionsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const next = keywordInput.trim();
    const timer = setTimeout(() => {
      if (appliedKeyword.current === next) return;
      appliedKeyword.current = next;
      setFilters((current) => ({ ...current, q: next }));
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [keywordInput]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }

    // Deferred via queueMicrotask (same pattern as components/Tools/AedContent.tsx
    // and lib/hooks/useSharedGeolocation.ts): setState called synchronously in an
    // effect body trips react-hooks/set-state-in-effect.
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setFailed(false);
    });
    fetchWithTimeout(`/api/food-safety/border-rejections?${params.toString()}`, {
      timeoutMs: 10000,
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (controller.signal.aborted) return;
        if (body && body.ok && body.data) {
          setData(body.data as BorderFoodRejectionsPage);
        } else {
          setFailed(true);
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn("Border-rejected food request failed:", error);
        setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [filters, page, pageSize, reloadToken]);

  const updateFilter = useCallback((key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }, []);

  const clearFilters = () => {
    appliedKeyword.current = "";
    setFilters(EMPTY_FILTERS);
    setKeywordInput("");
    setPage(1);
  };

  const facets = data?.facets ?? null;
  const hasActiveFilters = Object.values(filters).some(Boolean) || keywordInput.trim() !== "";
  const tableEmpty = facets !== null && facets.total === 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 p-6 shadow-sm dark:border-orange-950 dark:from-orange-950/40 dark:via-amber-950/20 dark:to-slate-900">
        <h2 className="text-xl font-bold text-orange-950 dark:text-orange-200">🛃 邊境查驗不合格進口食品</h2>
        <p className="mt-1 text-sm text-orange-900/80 dark:text-orange-300/80">
          彙整衛生福利部食品藥物管理署公告的進口食品邊境查驗不合格紀錄，可依產地、不合格原因與發布日查詢；案內不符合商品依規定退運或銷毀，並非市售商品的抽驗結果。
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white/80 p-3 shadow-xs backdrop-blur-xs dark:bg-slate-900/80">
            <p className="text-xs text-neutral-500 dark:text-slate-400">收錄筆數</p>
            <p className="text-2xl font-black text-orange-600 dark:text-orange-400">{facets ? facets.total.toLocaleString("zh-TW") : "--"}</p>
          </div>
          <div className="rounded-xl bg-white/80 p-3 shadow-xs backdrop-blur-xs dark:bg-slate-900/80">
            <p className="text-xs text-neutral-500 dark:text-slate-400">資料日期（最新發布日）</p>
            <p className="text-lg font-black text-neutral-700 dark:text-slate-200">{facets?.latestPublishedOn ?? "--"}</p>
          </div>
          <div className="rounded-xl bg-white/80 p-3 shadow-xs backdrop-blur-xs dark:bg-slate-900/80">
            <p className="text-xs text-neutral-500 dark:text-slate-400">收錄最早發布日</p>
            <p className="text-lg font-black text-neutral-700 dark:text-slate-200">{facets?.earliestPublishedOn ?? "--"}</p>
          </div>
          <div className="rounded-xl bg-white/80 p-3 shadow-xs backdrop-blur-xs dark:bg-slate-900/80">
            <p className="text-xs text-neutral-500 dark:text-slate-400">本站最近同步</p>
            <p className="text-lg font-black text-neutral-700 dark:text-slate-200">{formatSyncedAt(facets?.lastSyncedAt ?? null)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
        <strong>資料說明：</strong>
        本頁依衛生福利部食品藥物管理署公開資料整理，非本站判定；內容以食藥署公告為準。為保護業者與影像權益，本頁不顯示進口商地址與附圖。
      </div>

      {/* 篩選 */}
      <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="border-food-origin" className={labelClass}>產地</label>
            <select
              id="border-food-origin"
              value={filters.origin}
              onChange={(e) => updateFilter("origin", e.target.value)}
              className={inputClass}
            >
              <option value="">全部產地</option>
              {facets?.origins.map((origin) => (
                <option key={origin.name} value={origin.name}>
                  {origin.name}（{origin.count}）
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="border-food-reason" className={labelClass}>不合格原因</label>
            <select
              id="border-food-reason"
              value={filters.reason}
              onChange={(e) => updateFilter("reason", e.target.value)}
              className={inputClass}
            >
              <option value="">全部原因</option>
              {facets?.reasons.map((reason) => (
                <option key={reason.name} value={reason.name}>
                  {reason.name}（{reason.count}）
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="border-food-from" className={labelClass}>發布日（起）</label>
            <input
              id="border-food-from"
              type="date"
              value={filters.from}
              min={facets?.earliestPublishedOn ?? undefined}
              max={filters.to || facets?.latestPublishedOn || undefined}
              onChange={(e) => updateFilter("from", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="border-food-to" className={labelClass}>發布日（迄）</label>
            <input
              id="border-food-to"
              type="date"
              value={filters.to}
              min={filters.from || facets?.earliestPublishedOn || undefined}
              max={facets?.latestPublishedOn ?? undefined}
              onChange={(e) => updateFilter("to", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="border-food-keyword" className={labelClass}>關鍵字</label>
            <input
              id="border-food-keyword"
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="搜尋品名、牌名、製造廠或檢出說明（如：櫻桃、辣椒、蘇丹）"
              className={inputClass}
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ✕ 清除篩選
            </button>
          )}
        </div>
      </div>

      {/* 結果 */}
      {loading && !data && (
        <div className="flex justify-center py-16">
          <LoadingOrb size={36} />
        </div>
      )}

      {failed && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <p className="font-semibold">邊境查驗資料暫時無法載入。</p>
          <p className="mt-1">請稍後再試；這不代表沒有不合格紀錄。</p>
          <button
            type="button"
            onClick={() => setReloadToken((n) => n + 1)}
            className="mt-3 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
          >
            重新載入
          </button>
        </div>
      )}

      {!failed && tableEmpty && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          目前沒有可顯示的邊境查驗不合格食品資料（本站尚未完成首次資料同步）。請稍後再試，或直接至食藥署開放資料查閱原始內容。
        </div>
      )}

      {!failed && data && !tableEmpty && (
        <div className={`space-y-3 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <p className="text-xs text-neutral-500 dark:text-slate-400">
            共找到 {data.total.toLocaleString("zh-TW")} 筆符合之不合格紀錄（依發布日由新到舊）
          </p>

          {data.items.length === 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              沒有符合條件的紀錄，請調整篩選條件。
            </div>
          )}

          <ul className="space-y-3">
            {data.items.map((item) => (
              <li
                key={item.id}
                className="rounded-2xl border border-neutral-200 bg-white p-4.5 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-neutral-800 dark:text-slate-100">
                      {item.subject}
                      {item.brandName && (
                        <span className="ml-2 text-xs font-normal text-neutral-400 dark:text-slate-500">牌名：{item.brandName}</span>
                      )}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800 dark:bg-orange-950/60 dark:text-orange-300">
                        產地：{item.originCountry}
                      </span>
                      {item.reasons.map((reason) => (
                        <span
                          key={reason}
                          className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-neutral-500 dark:text-slate-400">
                    <p>發布日：{item.publishedOn ?? "—"}</p>
                    {item.inspectionAcceptedOn && <p>報驗受理：{item.inspectionAcceptedOn}</p>}
                  </div>
                </div>

                {item.detail && (
                  <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-700 dark:bg-slate-800/60 dark:text-slate-300">
                    <p className="font-semibold text-neutral-800 dark:text-slate-200">不合格原因暨檢出量：</p>
                    <p className="mt-1 whitespace-pre-line">{item.detail}</p>
                  </div>
                )}

                <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-neutral-600 sm:grid-cols-2 dark:text-slate-400">
                  {item.manufacturerName && (
                    <div className="flex gap-1">
                      <dt className="shrink-0 font-semibold">製造廠／出口商：</dt>
                      <dd className="min-w-0 break-words">{item.manufacturerName}</dd>
                    </div>
                  )}
                  {item.importerName && (
                    <div className="flex gap-1">
                      <dt className="shrink-0 font-semibold">進口商：</dt>
                      <dd className="min-w-0 break-words">{item.importerName}</dd>
                    </div>
                  )}
                  {item.weight && (
                    <div className="flex gap-1">
                      <dt className="shrink-0 font-semibold">重量：</dt>
                      <dd className="min-w-0 break-words">{item.weight}</dd>
                    </div>
                  )}
                  {item.hsCode && (
                    <div className="flex gap-1">
                      <dt className="shrink-0 font-semibold">貨品分類號列：</dt>
                      <dd className="min-w-0 break-words">{item.hsCode}</dd>
                    </div>
                  )}
                  {item.disposition && (
                    <div className="flex gap-1 sm:col-span-2">
                      <dt className="shrink-0 font-semibold">處置情形：</dt>
                      <dd className="min-w-0 break-words">{item.disposition}</dd>
                    </div>
                  )}
                </dl>

                {(item.legalLimit || item.inspectionMethod) && (
                  <details className="mt-3 text-xs text-neutral-600 dark:text-slate-400">
                    <summary className="cursor-pointer font-medium text-primary dark:text-primaryho">法規限量標準與檢驗方法</summary>
                    <div className="mt-2 space-y-2 rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/80">
                      {item.legalLimit && (
                        <p className="whitespace-pre-line">
                          <span className="font-semibold">法規限量標準：</span>
                          {item.legalLimit}
                        </p>
                      )}
                      {item.inspectionMethod && (
                        <p className="whitespace-pre-line">
                          <span className="font-semibold">檢驗方法：</span>
                          {item.inspectionMethod}
                        </p>
                      )}
                    </div>
                  </details>
                )}

                {item.duplicateCount > 1 && (
                  <p className="mt-2 text-[11px] text-neutral-400 dark:text-slate-500">
                    官方資料中有 {item.duplicateCount} 筆內容完全相同的紀錄，已合併顯示。
                  </p>
                )}
              </li>
            ))}
          </ul>

          <Pagination
            page={page}
            pageSize={pageSize}
            totalItems={data.total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            itemLabel="筆紀錄"
          />
        </div>
      )}

      <p className="px-2 text-center text-[11px] leading-relaxed text-neutral-500 dark:text-slate-400">
        資料來源：衛生福利部食品藥物管理署「不符合食品資訊」開放資料（
        <a
          href={appendOutboundUtm(DATASET_URL, { medium: "tool_outbound", campaign: "border_food_rejections" })}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-primary"
        >
          data.gov.tw 資料集 6133
        </a>
        ），依政府資料開放授權條款提供，上游約每 7 日更新；以上資料依食藥署公開資料整理，非本站判定。
      </p>
    </div>
  );
}
