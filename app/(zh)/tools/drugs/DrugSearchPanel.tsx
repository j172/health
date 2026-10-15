"use client";

import { useEffect, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import Pagination from "@/components/Tools/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";

interface DrugItem {
  id: number;
  license_no: string;
  name_zh: string;
  name_en: string | null;
  shape: string | null;
  dosage_form: string | null;
  color: string | null;
  odor: string | null;
  score_mark: string | null;
  size_mm: string | null;
  imprint_1: string | null;
  imprint_2: string | null;
  image_url: string | null;
  /** Set when the license is on a TFDA shortage list (issue #670); null otherwise. */
  shortage?: "with_alternative" | "no_alternative" | null;
  /** Set when the license was ever named in a TFDA recall (issue #675); null otherwise. */
  recall?: { count: number; latest_recalled_on: string | null; worst_level: RecallLevel } | null;
}

/** Normalized server-side from the agency's 14 spellings; '1' is the most severe. */
type RecallLevel = "1" | "2" | "3" | "未載明";

interface DrugIngredient {
  prescription_label: string | null;
  ingredient_name: string;
  ingredient_code: string | null;
  content_description: string | null;
  content_amount: string | null;
  content_unit: string | null;
}

interface DrugShortageNotice {
  has_alternative: boolean;
  announced_on: string | null;
  supply_status: string | null;
}

interface DrugRecallNotice {
  product_name: string;
  recalled_on: string | null;
  recall_level: RecallLevel;
  recall_level_raw: string | null;
  holder_name: string | null;
  batch_no: string | null;
  reason: string | null;
}

const recallLevelText = (level: RecallLevel): string => (level === "未載明" ? "分級未載明" : `第${level}級`);

export default function DrugSearchPanel({ initialKeyword = "" }: { initialKeyword?: string }) {
  const [searchInput, setSearchInput] = useState(initialKeyword);
  const [drugs, setDrugs] = useState<DrugItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchedFor, setSearchedFor] = useState(initialKeyword);

  const [expandedLicense, setExpandedLicense] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<DrugIngredient[] | null>(null);
  const [shortageNotices, setShortageNotices] = useState<DrugShortageNotice[]>([]);
  const [recallNotices, setRecallNotices] = useState<DrugRecallNotice[]>([]);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);

  // Pilot for issue #133's shared pagination hook: 藥品查詢 defaults to the 30 most
  // recently-added drugs (最新30筆) and, unlike before, can now page through the rest
  // instead of hard-stopping at 30/50 with no way to see more.
  const { page, pageSize, setPage, setPageSize } = usePagination();

  useEffect(() => {
    let cancelled = false;

    // Deferred via queueMicrotask (see e4800b1 / issue #121): calling setState
    // synchronously in an effect body trips react-hooks/set-state-in-effect.
    queueMicrotask(() => {
      (async () => {
        if (cancelled) return;
        setLoading(true);
        setError(false);
        try {
          const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
          if (searchedFor) params.set("keyword", searchedFor);
          const res = await fetch(`/api/drugs?${params.toString()}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (cancelled) return;
          setDrugs(data.drugs || []);
          setTotal(typeof data.total === "number" ? data.total : 0);
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

  const toggleIngredients = async (licenseNo: string) => {
    if (expandedLicense === licenseNo) {
      setExpandedLicense(null);
      setIngredients(null);
      setShortageNotices([]);
      setRecallNotices([]);
      return;
    }

    setExpandedLicense(licenseNo);
    setIngredients(null);
    setShortageNotices([]);
    setRecallNotices([]);
    setIngredientsLoading(true);
    try {
      const res = await fetch(`/api/drugs?licenseNo=${encodeURIComponent(licenseNo)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setIngredients(data.ingredients);
      setShortageNotices(Array.isArray(data.shortages) ? data.shortages : []);
      setRecallNotices(Array.isArray(data.recalls) ? data.recalls : []);
    } catch {
      setIngredients([]);
    } finally {
      setIngredientsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = searchInput.trim();
    if (!keyword) {
      handleClear();
      return;
    }

    setSearchedFor(keyword);
    setPage(1);
  };

  const handleClear = () => {
    setSearchInput("");
    setSearchedFor("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <p className="text-xs text-neutral-500 dark:text-slate-400">⚠️ 本資料庫為藥品許可證與外觀識別資料，不包含健保價格／給付資訊，僅供辨識參考，不構成用藥指示。</p>

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

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">查詢藥品資料失敗，請稍後再試。</div>}

      {!loading && !error && drugs && (
        <>
          <p className="text-xs text-neutral-500 dark:text-slate-400">{searchedFor ? `「${searchedFor}」共 ${total} 筆結果` : `最新收錄藥品，共 ${total} 筆`}</p>

          {drugs.length === 0 ? (
            <p className="py-8 text-center text-neutral-500 dark:text-slate-400">查無符合的藥品。</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {drugs.map((d) => (
                <div key={d.id} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-50 dark:bg-slate-800/60">
                      {d.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.image_url} alt={d.name_zh} className="h-full w-full object-contain" loading="lazy" />
                      ) : (
                        <span className="text-2xl">💊</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-neutral-800 dark:text-slate-100">{d.name_zh}</p>
                      {d.shortage && (
                        <span
                          className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${
                            d.shortage === "no_alternative"
                              ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                          }`}
                        >
                          目前短缺{d.shortage === "no_alternative" ? "（無替代藥品）" : "（有替代藥品）"}
                        </span>
                      )}
                      {d.recall && (
                        <span
                          className={`mt-1 ml-1 inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${
                            d.recall.worst_level === "1"
                              ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                              : "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300"
                          }`}
                        >
                          曾被回收（{d.recall.count} 筆{d.recall.latest_recalled_on ? `，最近 ${d.recall.latest_recalled_on}` : ""}）
                        </span>
                      )}
                      {d.name_en && <p className="text-xs text-neutral-500 dark:text-slate-400">{d.name_en}</p>}
                      <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">許可證：{d.license_no}</p>
                      <div className="mt-2 flex flex-wrap gap-1 text-xs text-neutral-600 dark:text-slate-300">
                        {d.shape && <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-slate-800 dark:text-slate-300">形狀：{d.shape}</span>}
                        {d.color && <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-slate-800 dark:text-slate-300">顏色：{d.color}</span>}
                        {d.score_mark && d.score_mark !== "無" && <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-slate-800 dark:text-slate-300">刻痕：{d.score_mark}</span>}
                        {(d.imprint_1 || d.imprint_2) && <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-slate-800 dark:text-slate-300">標註：{[d.imprint_1, d.imprint_2].filter(Boolean).join(" / ")}</span>}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleIngredients(d.license_no)}
                    className="mt-3 text-xs font-medium text-primary hover:underline"
                  >
                    {expandedLicense === d.license_no ? "收合成分 ▲" : "查看成分 ▼"}
                  </button>

                  {expandedLicense === d.license_no && (
                    <div className="mt-2 border-t border-neutral-100 pt-2 dark:border-slate-800">
                      {!ingredientsLoading && shortageNotices.length > 0 && (
                        <div className="mb-2 space-y-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                          <p className="font-semibold">
                            目前列於食藥署藥品短缺名單
                            <span className="font-normal">（依食藥署公開資料，非本站判定；是否換藥請洽醫師或藥師）</span>
                          </p>
                          {shortageNotices.map((n, i) => (
                            <details key={i}>
                              <summary className="cursor-pointer">
                                {n.has_alternative ? "經評估有替代藥品" : "經評估無替代藥品"}
                                {n.announced_on ? `．公告更新 ${n.announced_on}` : ""}
                              </summary>
                              {n.supply_status && <p className="mt-1 whitespace-pre-line">{n.supply_status}</p>}
                            </details>
                          ))}
                        </div>
                      )}
                      {!ingredientsLoading && recallNotices.length > 0 && (
                        <div className="mb-2 space-y-2 rounded-lg bg-orange-50 p-2 text-xs text-orange-900 dark:bg-orange-950/30 dark:text-orange-200">
                          <p className="font-semibold">
                            此許可證曾列於食藥署回收公告
                            <span className="font-normal">（依食藥署公開資料，非本站判定；回收通常只針對特定批號，請核對藥品批號並洽藥師）</span>
                          </p>
                          {recallNotices.map((n, i) => (
                            <details key={i}>
                              <summary className="cursor-pointer">
                                {recallLevelText(n.recall_level)}
                                {n.recalled_on ? `．回收日期 ${n.recalled_on}` : ""}
                                {n.product_name ? `．${n.product_name}` : ""}
                              </summary>
                              <div className="mt-1 space-y-1">
                                {n.batch_no && <p className="whitespace-pre-line break-words">批號：{n.batch_no}</p>}
                                {n.reason && <p className="whitespace-pre-line break-words">原因：{n.reason}</p>}
                                {n.recall_level_raw && /疑似/.test(n.recall_level_raw) && <p>分級原文：{n.recall_level_raw}</p>}
                              </div>
                            </details>
                          ))}
                        </div>
                      )}
                      {ingredientsLoading && (
                        <div className="flex justify-center py-2">
                          <LoadingOrb size={20} />
                        </div>
                      )}
                      {!ingredientsLoading && ingredients && ingredients.length === 0 && <p className="text-xs text-neutral-500 dark:text-slate-400">無成分資料。</p>}
                      {!ingredientsLoading && ingredients && ingredients.length > 0 && (
                        <ul className="space-y-1 text-xs text-neutral-600 dark:text-slate-300">
                          {ingredients.map((ing, i) => (
                            <li key={i}>
                              {ing.ingredient_name}
                              {ing.content_description && ing.content_unit && (
                                <span className="text-neutral-500 dark:text-slate-400">
                                  {" "}
                                  — {ing.content_description}
                                  {ing.content_unit}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <Pagination page={page} pageSize={pageSize} totalItems={total} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="筆藥品" />
        </>
      )}
    </div>
  );
}
