"use client";

import { useEffect, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import Pagination from "@/components/Tools/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";

interface ShortageItem {
  id: number;
  license_no: string;
  name_zh: string;
  name_en: string | null;
  /** true = 54504 (經評估有替代藥品), false = 54505 (經評估無替代藥品). */
  has_alternative: boolean;
  announced_on: string | null;
  supply_status: string | null;
  /** The license also exists in the drug appearance table, so the drug-search tab can show it. */
  in_drugs: boolean;
}

interface ShortagesMeta {
  total: number;
  withoutAlternativeCount: number;
  latestAnnouncedOn: string | null;
  lastSyncedAt: string | null;
}

/**
 * 藥品短缺 tab of /tools/drugs (issue #670) — the TFDA's published list of
 * drugs in short supply (data.gov.tw 54504 有替代藥品 / 54505 無替代藥品),
 * refreshed weekly. Everything shown, including the supply status and the
 * suggested substitutes, is the agency's own text: this page does not judge,
 * rank or recommend anything, and says so.
 */
export default function DrugShortagesPanel({ onViewDrug }: { onViewDrug: (licenseNo: string) => void }) {
  const [searchInput, setSearchInput] = useState("");
  const [searchedFor, setSearchedFor] = useState("");
  const [items, setItems] = useState<ShortageItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<ShortagesMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Own query-param names: this tab and the drug-search tab are two independent
  // paginated lists on one URL, so a page number from one must not leak into the other.
  const { page, pageSize, setPage, setPageSize } = usePagination({
    pageParam: "shortagePage",
    pageSizeParam: "shortagePageSize",
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
          const params = new URLSearchParams({ view: "shortages", page: String(page), pageSize: String(pageSize) });
          if (searchedFor) params.set("keyword", searchedFor);
          const res = await fetch(`/api/drugs?${params.toString()}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (cancelled) return;
          setItems(Array.isArray(data.shortages) ? data.shortages : []);
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
  }, [searchedFor, page, pageSize]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = searchInput.trim();
    setSearchedFor(keyword);
    setPage(1);
  };

  const handleClear = () => {
    setSearchInput("");
    setSearchedFor("");
    setPage(1);
  };

  const dataDate = meta?.latestAnnouncedOn ?? null;
  const syncedDate = meta?.lastSyncedAt ? meta.lastSyncedAt.slice(0, 10) : null;
  const tableIsEmpty = !!meta && meta.total === 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 text-xl font-bold text-neutral-800 dark:text-slate-100">藥品短缺名單</h2>
        <p className="text-sm text-neutral-600 dark:text-slate-300">
          食藥署公告目前供應吃緊或暫停供應的藥品品項，以及食藥署評估後的供應狀態與替代藥品建議。
        </p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        <p>
          資料來源：衛生福利部食品藥物管理署「經評估有替代藥品品項資料集」（data.gov.tw 54504）與「經評估無替代藥品品項資料集」（54505），依政府資料開放授權條款－第1版（OGDL 1.0）釋出，本站每週同步一次。
        </p>
        <p className="mt-1">
          供應狀態與替代藥品建議皆為食藥署公告原文，非本站判定；缺藥時是否換藥、如何換藥，請洽原處方醫師或藥師，請勿自行更換或停藥。
        </p>
        {meta && !tableIsEmpty && (
          <p className="mt-1 font-medium text-neutral-700 dark:text-slate-200">
            資料日期：{dataDate ?? "未載明"}（食藥署公告更新時間最新值）
            {syncedDate ? `．本站最近同步：${syncedDate}` : ""}
          </p>
        )}
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="輸入藥品中文或英文名稱、許可證字號"
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <button type="submit" className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primaryho">
          搜尋
        </button>
        {searchedFor && (
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

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">查詢藥品短缺資料失敗，請稍後再試。</div>}

      {!loading && !error && items && (
        <>
          <p className="text-xs text-neutral-500 dark:text-slate-400">{searchedFor ? `「${searchedFor}」共 ${total} 筆缺藥品項` : `目前共 ${total} 筆缺藥品項`}</p>

          {meta && meta.withoutAlternativeCount === 0 && !tableIsEmpty && (
            <p className="text-xs text-neutral-500 dark:text-slate-400">食藥署另公布「經評估無替代藥品」名單（54505），截至目前該名單沒有品項；下列皆為「經評估有替代藥品」。</p>
          )}

          {items.length === 0 ? (
            <p className="py-8 text-center text-neutral-500 dark:text-slate-400">
              {tableIsEmpty ? "目前尚無資料（尚未完成首次同步，或來源暫時無法取得），請稍後再試。" : "查無符合的缺藥品項。"}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {items.map((item) => (
                <div key={item.id} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-neutral-800 dark:text-slate-100">{item.name_zh || item.license_no}</p>
                      {item.name_en && <p className="text-xs text-neutral-500 dark:text-slate-400">{item.name_en}</p>}
                      {item.license_no && <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">許可證：{item.license_no}</p>}
                    </div>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${
                        item.has_alternative
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                          : "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                      }`}
                    >
                      {item.has_alternative ? "經評估有替代藥品" : "經評估無替代藥品"}
                    </span>
                  </div>

                  {item.announced_on && <p className="mt-2 text-xs text-neutral-500 dark:text-slate-400">公告更新：{item.announced_on}</p>}

                  {item.supply_status && (
                    <details className="mt-2 text-xs text-neutral-600 dark:text-slate-300">
                      <summary className="cursor-pointer font-medium text-primary">供應狀態與替代建議（食藥署公告原文）</summary>
                      <p className="mt-2 whitespace-pre-line leading-relaxed">{item.supply_status}</p>
                    </details>
                  )}

                  {item.in_drugs && (
                    <button type="button" onClick={() => onViewDrug(item.license_no)} className="mt-3 text-xs font-medium text-primary hover:underline">
                      查看藥品外觀與成分 →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <Pagination page={page} pageSize={pageSize} totalItems={total} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="筆缺藥品項" />
        </>
      )}
    </div>
  );
}
