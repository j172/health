"use client";

import { useEffect, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";

interface CarbonFootprintProductItem {
  id: number;
  cfpl_code: string;
  product_name: string;
  company_name: string | null;
  carbon_footprint_data: string | null;
  declared_unit: string | null;
  expire_date: string | null;
}

export default function CarbonFootprintProductsContent() {
  const [searchInput, setSearchInput] = useState("");
  const [products, setProducts] = useState<CarbonFootprintProductItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchedFor, setSearchedFor] = useState("");

  const fetchProducts = async (kw?: string) => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (kw) params.set("keyword", kw);
      const url = params.toString()
        ? `/api/carbon-footprint-products?${params.toString()}`
        : "/api/carbon-footprint-products";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProducts(data.products || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      fetchProducts();
    });
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = searchInput.trim();
    setSearchedFor(keyword);
    await fetchProducts(keyword);
  };

  const handleClear = () => {
    setSearchInput("");
    setSearchedFor("");
    fetchProducts();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">
          🌍 產品碳足跡標籤查詢
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">
          查詢環境部審查通過、碳標籤證書有效期限內之產品碳足跡數據。資料來源：環境部開放資料（cfp_p_01）。
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="輸入產品名稱、公司名稱或碳標籤證書字號"
          className="min-w-[180px] flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />

        <button
          type="submit"
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primaryho"
        >
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

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          查詢碳足跡產品資料失敗，請稍後再試。
        </div>
      )}

      {!loading && !error && products && (
        <>
          <p className="text-xs text-neutral-500 dark:text-slate-400">
            {searchedFor
              ? `搜尋結果共 ${products.length} 筆${products.length >= 50 ? "（僅顯示前50筆，請縮小關鍵字範圍）" : ""}`
              : `最新收錄碳足跡產品（顯示前 ${products.length} 筆）`}
          </p>

          {products.length === 0 ? (
            <p className="py-8 text-center text-neutral-500 dark:text-slate-400">
              查無符合的碳足跡產品。
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    <h2 className="font-semibold text-neutral-800 dark:text-slate-100">
                      {p.product_name}
                    </h2>

                    <p className="mt-1.5 text-xs text-neutral-500 dark:text-slate-400">
                      碳標籤字號：
                      <span className="font-mono font-medium text-neutral-700 dark:text-slate-300">
                        {p.cfpl_code}
                      </span>
                    </p>

                    {p.company_name && (
                      <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                        公司名稱：
                        <span className="text-neutral-700 dark:text-slate-300">
                          {p.company_name}
                        </span>
                      </p>
                    )}

                    {p.carbon_footprint_data && (
                      <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                        碳足跡數據：
                        <span className="text-neutral-700 dark:text-slate-300">
                          {p.carbon_footprint_data}
                          {p.declared_unit ? ` / ${p.declared_unit}` : ""}
                        </span>
                      </p>
                    )}
                  </div>

                  {p.expire_date && (
                    <div className="mt-4 border-t border-neutral-100 pt-2 text-xs text-neutral-500 dark:border-slate-800/80 dark:text-slate-400">
                      有效期限：{p.expire_date.split(" ")[0]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
