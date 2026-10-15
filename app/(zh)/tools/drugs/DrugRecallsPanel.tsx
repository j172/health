"use client";

import { useEffect, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import Pagination from "@/components/Tools/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";

/** The only recall levels the API ever returns (normalized server-side from 14 upstream spellings). */
type RecallLevel = "1" | "2" | "3" | "未載明";

const LEVEL_FILTER_OPTIONS: Array<{ value: "" | RecallLevel; label: string }> = [
  { value: "", label: "全部分級" },
  { value: "1", label: "第1級" },
  { value: "2", label: "第2級" },
  { value: "3", label: "第3級" },
  { value: "未載明", label: "未載明分級" },
];

const levelLabel = (level: RecallLevel): string => (level === "未載明" ? "分級未載明" : `第${level}級`);

const LEVEL_BADGE_CLASS: Record<RecallLevel, string> = {
  "1": "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  "2": "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
  "3": "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  未載明: "bg-neutral-100 text-neutral-700 dark:bg-slate-800 dark:text-slate-300",
};

interface RecallItem {
  id: number;
  product_name: string;
  /** The 許可證字號 cell as published; may name several licenses or none. */
  license_text: string | null;
  holder_name: string | null;
  doc_no: string | null;
  recalled_on: string | null;
  batch_no: string | null;
  reason: string | null;
  recall_level: RecallLevel;
  /** The agency's own spelling of the level, e.g. 疑似第一級. */
  recall_level_raw: string | null;
  /** Set only when the recall names exactly one license and that drug is in the drug appearance table. */
  drug_license_no: string | null;
}

interface RecallsMeta {
  total: number;
  levelCounts: Record<RecallLevel, number>;
  latestRecalledOn: string | null;
  earliestRecalledOn: string | null;
  lastSyncedAt: string | null;
}

/**
 * 回收藥品 tab of /tools/drugs (issue #675) — the TFDA's published register of
 * drug recalls since 2008 (data.gov.tw 6947), refreshed weekly. Everything
 * shown, including the level, the batch numbers and the reason, is the
 * agency's own text: this page does not judge, rank or recommend anything, and
 * says so. A recall normally names specific batches, which the page also says,
 * so a recall record is never read as "every box of this drug is bad".
 */
export default function DrugRecallsPanel({ onViewDrug }: { onViewDrug: (licenseNo: string) => void }) {
  const [searchInput, setSearchInput] = useState("");
  const [searchedFor, setSearchedFor] = useState("");
  const [level, setLevel] = useState<"" | RecallLevel>("");
  const [items, setItems] = useState<RecallItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<RecallsMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Own query-param names: the three tabs are independent paginated lists on one URL,
  // so a page number from one must not leak into another.
  const { page, pageSize, setPage, setPageSize } = usePagination({
    pageParam: "recallPage",
    pageSizeParam: "recallPageSize",
  });

  useEffect(() => {
    let cancelled = false;

    // Deferred via queueMicrotask (see DrugSearchPanel / issue #121): calling
    // setState synchronously in an effect body trips react-hooks/set-state-in-effect.
    queueMicrotask(() => {
      (async () => {
        if (cancelled) return;
        setLoading(true);
        setError(false);
        try {
          const params = new URLSearchParams({ view: "recalls", page: String(page), pageSize: String(pageSize) });
          if (searchedFor) params.set("keyword", searchedFor);
          if (level) params.set("level", level);
          const res = await fetch(`/api/drugs?${params.toString()}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (cancelled) return;
          setItems(Array.isArray(data.recalls) ? data.recalls : []);
          setTotal(typeof data.total === "number" ? data.total : 0);
          setMeta(data.meta ?? null);
        } catch {
          if (!cancelled) setError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [searchedFor, level, page, pageSize]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchedFor(searchInput.trim());
    setPage(1);
  };

  const handleClear = () => {
    setSearchInput("");
    setSearchedFor("");
    setLevel("");
    setPage(1);
  };

  const handleLevelChange = (value: "" | RecallLevel) => {
    setLevel(value);
    setPage(1);
  };

  const dataDate = meta?.latestRecalledOn ?? null;
  const sinceDate = meta?.earliestRecalledOn ?? null;
  const syncedDate = meta?.lastSyncedAt ? meta.lastSyncedAt.slice(0, 10) : null;
  const tableIsEmpty = !!meta && meta.total === 0;
  const filtered = !!searchedFor || !!level;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 text-xl font-bold text-neutral-800 dark:text-slate-100">回收藥品名單</h2>
        <p className="text-sm text-neutral-600 dark:text-slate-300">
          食藥署公告的藥品回收紀錄，含回收分級、受影響的批號與回收原因。可用藥品名稱、許可證字號、藥廠或盒上的批號搜尋。
        </p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        <p>
          資料來源：衛生福利部食品藥物管理署「回收藥品」資料集（data.gov.tw 6947），依政府資料開放授權條款－第1版（OGDL 1.0）釋出，本站每週同步一次。
        </p>
        <p className="mt-1">
          回收分級、批號與原因皆為食藥署公告原文，依食藥署公開資料，非本站判定；分級數字越小，代表食藥署評估的潛在風險越高（第1級最高）。回收通常只針對公告中的特定批號，不代表同品項的所有藥品都有問題；若手邊藥品的批號與公告相符，請洽原處方醫師或藥師，請勿自行停藥。
        </p>
        {meta && !tableIsEmpty && (
          <p className="mt-1 font-medium text-neutral-700 dark:text-slate-200">
            資料日期：{dataDate ?? "未載明"}（食藥署回收日期最新值{sinceDate ? `，收錄自 ${sinceDate} 起` : ""}）
            {syncedDate ? `．本站最近同步：${syncedDate}` : ""}
          </p>
        )}
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="輸入藥品名稱、許可證字號、藥廠或批號"
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <select
          value={level}
          onChange={(e) => handleLevelChange(e.target.value as "" | RecallLevel)}
          aria-label="回收分級"
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          {LEVEL_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
              {option.value && meta ? `（${meta.levelCounts[option.value] ?? 0}）` : ""}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primaryho">
          搜尋
        </button>
        {filtered && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            清除
          </button>
        )}
      </form>

      {loading && (
        <div className="flex justify-center py-8">
          <LoadingOrb size={32} />
        </div>
      )}

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">查詢回收藥品資料失敗，請稍後再試。</div>}

      {!loading && !error && items && (
        <>
          <p className="text-xs text-neutral-500 dark:text-slate-400">
            {filtered
              ? `${[searchedFor ? `「${searchedFor}」` : null, level ? levelLabel(level) : null].filter(Boolean).join("、")}共 ${total} 筆回收紀錄`
              : `目前共 ${total} 筆回收紀錄`}
          </p>

          {items.length === 0 ? (
            <p className="py-8 text-center text-neutral-500 dark:text-slate-400">
              {tableIsEmpty ? "目前尚無資料（尚未完成首次同步，或來源暫時無法取得），請稍後再試。" : "查無符合的回收紀錄。"}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {items.map((item) => (
                <div key={item.id} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold text-neutral-800 dark:text-slate-100">{item.product_name}</p>
                      {item.license_text && <p className="mt-1 break-words text-xs text-neutral-500 dark:text-slate-400">許可證：{item.license_text}</p>}
                      {item.holder_name && <p className="text-xs text-neutral-500 dark:text-slate-400">許可證持有者：{item.holder_name}</p>}
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${LEVEL_BADGE_CLASS[item.recall_level]}`}>
                      {levelLabel(item.recall_level)}
                    </span>
                  </div>

                  {item.recalled_on && <p className="mt-2 text-xs text-neutral-500 dark:text-slate-400">回收日期：{item.recalled_on}</p>}

                  {(item.batch_no || item.reason || item.doc_no || item.recall_level_raw) && (
                    <details className="mt-2 text-xs text-neutral-600 dark:text-slate-300">
                      <summary className="cursor-pointer font-medium text-primary">批號與回收原因（食藥署公告原文）</summary>
                      <dl className="mt-2 space-y-1.5 leading-relaxed">
                        {item.batch_no && (
                          <div>
                            <dt className="font-medium">批號</dt>
                            <dd className="whitespace-pre-line break-words">{item.batch_no}</dd>
                          </div>
                        )}
                        {item.reason && (
                          <div>
                            <dt className="font-medium">回收原因</dt>
                            <dd className="whitespace-pre-line break-words">{item.reason}</dd>
                          </div>
                        )}
                        <div>
                          <dt className="font-medium">分級原文</dt>
                          <dd>{item.recall_level_raw ?? "未填"}</dd>
                        </div>
                        {item.doc_no && (
                          <div>
                            <dt className="font-medium">公文文號</dt>
                            <dd className="break-words">{item.doc_no}</dd>
                          </div>
                        )}
                      </dl>
                    </details>
                  )}

                  {item.drug_license_no && (
                    <button type="button" onClick={() => onViewDrug(item.drug_license_no as string)} className="mt-3 text-xs font-medium text-primary hover:underline">
                      查看藥品外觀與成分 →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <Pagination page={page} pageSize={pageSize} totalItems={total} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="筆回收紀錄" />
        </>
      )}
    </div>
  );
}
