"use client";

import { useEffect, useState } from "react";
import type { TaxOrganizationItem } from "@/lib/server/taxOrganizations/queries";

const TAIWAN_CITIES = [
  "全部縣市",
  "臺北市",
  "新北市",
  "基隆市",
  "桃園市",
  "新竹市",
  "新竹縣",
  "苗栗縣",
  "臺中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義市",
  "嘉義縣",
  "臺南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "臺東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
];

export default function TaxOrganizationsContent() {
  const [items, setItems] = useState<TaxOrganizationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchedFor, setSearchedFor] = useState("");
  const [city, setCity] = useState("全部縣市");

  const fetchItems = async (kw?: string, c?: string) => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (kw) params.set("keyword", kw);
      if (c && c !== "全部縣市") params.set("city", c);
      const url = params.toString()
        ? `/api/tax-organizations?${params.toString()}`
        : "/api/tax-organizations";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tax-organizations");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setItems(data.items || []);
          setError(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = searchInput.trim();
    setSearchedFor(keyword);
    await fetchItems(keyword, city);
  };

  const handleCityChange = (newCity: string) => {
    setCity(newCity);
    fetchItems(searchInput.trim(), newCity);
  };

  const handleClear = () => {
    setSearchInput("");
    setSearchedFor("");
    setCity("全部縣市");
    fetchItems("", "全部縣市");
  };

  const isFiltered = Boolean(searchedFor || (city && city !== "全部縣市"));

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-2xl dark:bg-blue-950/40">
            🏢
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
              非營利組織(NPO)與機關團體查詢
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              收錄財政部財政資訊中心開放之全國機關團體扣繳單位名冊，包含各類非營利組織（NPO）、社會福利慈善財團法人、公會協會、管委會等。支援統一編號、組織名稱及縣市快速查詢。
            </p>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="輸入 8 碼統一編號或組織名稱..."
              className="w-full rounded-xl border border-neutral-300 bg-neutral-50/50 px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:bg-white focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:bg-neutral-800"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={city}
              onChange={(e) => handleCityChange(e.target.value)}
              className="rounded-xl border border-neutral-300 bg-neutral-50/50 px-3 py-2.5 text-sm text-neutral-900 focus:border-blue-500 focus:bg-white focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:bg-neutral-800"
            >
              {TAIWAN_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-500 focus:outline-hidden disabled:opacity-50"
            >
              {loading ? "搜尋中..." : "搜尋"}
            </button>

            {isFiltered && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                title="重設篩選回到最新 30 筆"
              >
                重設
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          {isFiltered ? (
            <span>
              搜尋結果
              {searchedFor && (
                <span className="ml-1 text-blue-600 dark:text-blue-400">
                  「{searchedFor}」
                </span>
              )}
              {city !== "全部縣市" && (
                <span className="ml-1 text-neutral-500 dark:text-neutral-400">
                  ({city})
                </span>
              )}
              <span className="ml-1.5 text-xs text-neutral-500">
                （共 {items.length} 筆）
              </span>
            </span>
          ) : (
            <span>
              最新收錄非營利組織
              <span className="ml-1.5 text-xs font-normal text-neutral-500 dark:text-neutral-400">
                （顯示前 30 筆）
              </span>
            </span>
          )}
        </h2>
        {isFiltered && (
          <button
            onClick={handleClear}
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            返回預設清單
          </button>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <p className="font-semibold">載入非營利組織資料時發生錯誤</p>
          <p className="mt-1 text-xs">請檢查網路連線或稍後再試。</p>
          <button
            onClick={() => fetchItems(searchedFor, city)}
            className="mt-3 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
          >
            重新嘗試
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !error && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="animate-pulse rounded-2xl border border-neutral-200/70 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="h-4 w-3/4 rounded-sm bg-neutral-200 dark:bg-neutral-800" />
              <div className="mt-3 h-3 w-1/2 rounded-sm bg-neutral-200 dark:bg-neutral-800" />
              <div className="mt-4 h-3 w-full rounded-sm bg-neutral-200 dark:bg-neutral-800" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && items.length === 0 && (
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-12 text-center shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-2xl dark:bg-neutral-800">
            🔍
          </div>
          <h3 className="mt-4 font-semibold text-neutral-900 dark:text-neutral-100">
            查無符合的非營利組織
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            請嘗試使用其他統一編號、組織簡稱或更換所在縣市。
          </p>
          {isFiltered && (
            <button
              onClick={handleClear}
              className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
            >
              清除搜尋條件
            </button>
          )}
        </div>
      )}

      {/* Items Grid */}
      {!loading && !error && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="group flex flex-col justify-between rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-xs transition hover:border-blue-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-blue-700"
            >
              <div>
                {/* Header: City Badge & BAN */}
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    {item.city}
                  </span>
                  {item.ban && (
                    <span className="font-mono text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                      統編：{item.ban}
                    </span>
                  )}
                </div>

                {/* Name */}
                <h3 className="mt-2.5 text-base font-bold text-neutral-900 group-hover:text-blue-600 dark:text-neutral-100 dark:group-hover:text-blue-400 leading-snug">
                  {item.name}
                </h3>

                {/* Reason / Details */}
                {item.reason && (
                  <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                    {item.reason}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="mt-3 border-t border-neutral-100 pt-2.5 text-[11px] text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
                {item.changeDate ? (
                  <span>最近異動：{item.changeDate}</span>
                ) : (
                  <span>資料來源：財政部</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

