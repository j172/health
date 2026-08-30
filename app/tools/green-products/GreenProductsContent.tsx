"use client";

import { useEffect, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";

interface GreenProductItem {
  id: number;
  flag_no: string;
  product_name: string;
  class_type: string | null;
  sign_date: string | null;
  expire_date: string | null;
  date_extend_date: string | null;
  is_expire: string | null;
}

export default function GreenProductsContent() {
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<GreenProductItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchedFor, setSearchedFor] = useState("");

  const fetchProducts = async (kw?: string, cat?: string) => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (kw) params.set("keyword", kw);
      if (cat) params.set("category", cat);
      const url = params.toString() ? `/api/green-products?${params.toString()}` : "/api/green-products";
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
    fetchProducts();
    fetch("/api/green-products?categories=true")
      .then((res) => (res.ok ? res.json() : { categories: [] }))
      .then((data) => {
        if (Array.isArray(data.categories)) {
          setCategories(data.categories);
        }
      })
      .catch(() => {});
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = searchInput.trim();
    setSearchedFor(keyword);
    await fetchProducts(keyword, category);
  };

  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat);
    fetchProducts(searchInput.trim(), newCat);
  };

  const handleClear = () => {
    setSearchInput("");
    setCategory("");
    setSearchedFor("");
    fetchProducts();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">
          🏷️ 環保標章產品查詢
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">
          查詢環境部認證之各類綠色環保標章產品（低污染、省能資源、可回收）與標章有效狀態。資料來源：環境部開放資料（gp_p_02）。
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="輸入產品名稱、型號或標章編號"
          className="min-w-[180px] flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />

        {categories.length > 0 && (
          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            aria-label="產品類別篩選"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">全部分類</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                類別 {c}
              </option>
            ))}
          </select>
        )}

        <button
          type="submit"
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primaryho"
        >
          搜尋
        </button>

        {(searchedFor || category) && (
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
          查詢環保產品資料失敗，請稍後再試。
        </div>
      )}

      {!loading && !error && products && (
        <>
          <p className="text-xs text-neutral-500 dark:text-slate-400">
            {searchedFor || category
              ? `搜尋結果共 ${products.length} 筆${products.length >= 50 ? "（僅顯示前50筆，請縮小關鍵字範圍）" : ""}`
              : `最新收錄環保產品（顯示前 ${products.length} 筆）`}
          </p>

          {products.length === 0 ? (
            <p className="py-8 text-center text-neutral-500 dark:text-slate-400">
              查無符合的環保產品。
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {products.map((p) => {
                const isExpired = p.is_expire === "1";
                return (
                  <div
                    key={p.id}
                    className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="font-semibold text-neutral-800 dark:text-slate-100">
                          {p.product_name}
                        </h2>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                            isExpired
                              ? "bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-400"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                          }`}
                        >
                          {isExpired ? "已逾期" : "有效認證"}
                        </span>
                      </div>

                      <p className="mt-1.5 text-xs text-neutral-500 dark:text-slate-400">
                        標章編號：
                        <span className="font-mono font-medium text-neutral-700 dark:text-slate-300">
                          {p.flag_no}
                        </span>
                      </p>

                      {p.class_type && (
                        <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                          產品類別：
                          <span className="text-neutral-700 dark:text-slate-300">
                            {p.class_type}
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="mt-4 border-t border-neutral-100 pt-2 text-xs text-neutral-500 dark:border-slate-800/80 dark:text-slate-400">
                      {p.sign_date && (
                        <div>生效日期：{p.sign_date.split(" ")[0]}</div>
                      )}
                      {p.expire_date && (
                        <div>有效期限：{p.expire_date.split(" ")[0]}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

