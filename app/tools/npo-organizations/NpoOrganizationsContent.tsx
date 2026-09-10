"use client";

import { useEffect, useState } from "react";
import type { NpoOrganizationItem } from "@/lib/server/npoOrganizations/queries";
import Pagination from "@/components/Tools/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";

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

const NPO_ATTRIBUTES = [
  "全部屬性",
  "老人福利",
  "身心障礙福利",
  "兒童青少年福利",
  "環境保護",
  "綜合性服務",
  "社區發展",
  "急難救助",
  "醫療衛生",
  "文教藝術",
  "性別平權與婦女",
  "原住民與多元族群",
  "國際倡議與交流",
];

export default function NpoOrganizationsContent() {
  const [items, setItems] = useState<NpoOrganizationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchedFor, setSearchedFor] = useState("");
  const [city, setCity] = useState("全部縣市");
  const [attribute, setAttribute] = useState("全部屬性");
  const [onlyProducts, setOnlyProducts] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const { page, pageSize, setPage, setPageSize } = usePagination();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (searchedFor) params.set("keyword", searchedFor);
        if (city && city !== "全部縣市") params.set("city", city);
        if (attribute && attribute !== "全部屬性") params.set("attribute", attribute);
        if (onlyProducts) params.set("hasProducts", "true");

        const res = await fetch(`/api/npo-organizations?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setItems(data.items || []);
          setTotal(typeof data.total === "number" ? data.total : 0);
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
  }, [searchedFor, city, attribute, onlyProducts, page, pageSize, retryNonce]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchedFor(searchInput.trim());
    setPage(1);
  };

  const handleCityChange = (newCity: string) => {
    setCity(newCity);
    setPage(1);
  };

  const handleAttributeChange = (newAttr: string) => {
    setAttribute(newAttr);
    setPage(1);
  };

  const handleClear = () => {
    setSearchInput("");
    setSearchedFor("");
    setCity("全部縣市");
    setAttribute("全部屬性");
    setOnlyProducts(false);
    setPage(1);
  };

  const isFiltered = Boolean(
    searchedFor ||
      (city && city !== "全部縣市") ||
      (attribute && attribute !== "全部屬性") ||
      onlyProducts,
  );

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-2xl dark:bg-teal-950/40">
            🤝
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
              全台公益組織 (NPO) 查詢名錄
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              整合台灣公益資訊中心（NPO Center）及財政部機關團體名冊，收錄全國社會福利慈善財團法人、兒少保護、身心障礙、老人照護、環境永續與急難救助等非營利公益組織。提供精確地址導航、官方網站連結、電話撥號與統一編號查詢。
            </p>
          </div>
        </div>
      </div>

      {/* Search & Multi-Filter Bar */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <form onSubmit={handleSearch} className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="輸入組織名稱、統一編號、負責人或服務關鍵字..."
              className="w-full rounded-xl border border-neutral-300 bg-neutral-50/50 px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-teal-500 focus:bg-white focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:bg-neutral-800"
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

          <div className="flex flex-wrap items-center gap-2">
            {/* Attribute Filter */}
            <select
              value={attribute}
              onChange={(e) => handleAttributeChange(e.target.value)}
              className="rounded-xl border border-neutral-300 bg-neutral-50/50 px-3 py-2.5 text-sm text-neutral-900 focus:border-teal-500 focus:bg-white focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:bg-neutral-800"
            >
              {NPO_ATTRIBUTES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            {/* City Filter */}
            <select
              value={city}
              onChange={(e) => handleCityChange(e.target.value)}
              className="rounded-xl border border-neutral-300 bg-neutral-50/50 px-3 py-2.5 text-sm text-neutral-900 focus:border-teal-500 focus:bg-white focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:bg-neutral-800"
            >
              {TAIWAN_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Charity Products Quick Toggle */}
            <button
              type="button"
              onClick={() => {
                setOnlyProducts(!onlyProducts);
                setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                onlyProducts
                  ? "bg-amber-500 text-white shadow-xs hover:bg-amber-600"
                  : "border border-amber-300 bg-amber-50/80 text-amber-800 hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50"
              }`}
              title="只顯示販售公益商品、庇護工場與愛心禮盒之機構"
            >
              <span>🎁</span>
              <span>{onlyProducts ? "顯示全部組織" : "僅看公益商品"}</span>
            </button>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-teal-500 focus:outline-hidden disabled:opacity-50"
            >
              {loading ? "搜尋中..." : "搜尋"}
            </button>

            {isFiltered && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                title="重設篩選回到最新收錄"
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
                <span className="ml-1 text-teal-600 dark:text-teal-400">
                  「{searchedFor}」
                </span>
              )}
              {attribute !== "全部屬性" && (
                <span className="ml-1 text-neutral-500 dark:text-neutral-400">
                  [{attribute}]
                </span>
              )}
              {city !== "全部縣市" && (
                <span className="ml-1 text-neutral-500 dark:text-neutral-400">
                  ({city})
                </span>
              )}
              <span className="ml-1.5 text-xs text-neutral-500">
                （共 {total} 筆）
              </span>
            </span>
          ) : (
            <span>
              最新收錄公益組織
              <span className="ml-1.5 text-xs font-normal text-neutral-500 dark:text-neutral-400">
                （共 {total} 筆）
              </span>
            </span>
          )}
        </h2>
        {isFiltered && (
          <button
            onClick={handleClear}
            className="text-xs text-teal-600 hover:underline dark:text-teal-400"
          >
            返回預設清單
          </button>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <p className="font-semibold">載入公益組織資料時發生錯誤</p>
          <p className="mt-1 text-xs">請檢查網路連線或稍後再試。</p>
          <button
            onClick={() => setRetryNonce((n) => n + 1)}
            className="mt-3 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
          >
            重新嘗試
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !error && (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
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
            查無符合的公益組織
          </h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            請嘗試使用其他統一編號、簡稱、不同屬性或更換所在縣市。
          </p>
          {isFiltered && (
            <button
              onClick={handleClear}
              className="mt-4 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-500"
            >
              清除搜尋條件
            </button>
          )}
        </div>
      )}

      {/* Items Grid */}
      {!loading && !error && items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="group flex flex-col justify-between rounded-2xl border border-neutral-200/80 bg-white p-4.5 shadow-xs transition hover:border-teal-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-teal-700"
            >
              <div>
                {/* Header Badges */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded-md bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                    {item.city}
                  </span>
                  {item.hasProducts && (
                    <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950/80 dark:text-amber-200">
                      🎁 販售公益商品
                    </span>
                  )}
                  {item.orgAttribute && (
                    <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                      {item.orgAttribute}
                    </span>
                  )}
                  {item.ban && (
                    <span className="ml-auto font-mono text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                      統編：{item.ban}
                    </span>
                  )}
                </div>

                {/* Organization Name */}
                <h3 className="mt-2.5 text-base font-bold text-neutral-900 group-hover:text-teal-600 dark:text-neutral-100 dark:group-hover:text-teal-400 leading-snug">
                  {item.name}
                </h3>

                {/* Product Note */}
                {item.productNote && (
                  <div className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/70 px-2.5 py-1.5 text-xs font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                    🛍️ {item.productNote}
                  </div>
                )}

                {/* Purpose or Reason summary */}
                {(item.purpose || item.workFocus || item.reason) && (
                  <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400 line-clamp-3 leading-relaxed">
                    {item.purpose || item.workFocus || item.reason}
                  </p>
                )}

                {/* Contact person & Phone */}
                {(item.contact || item.phone) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    {item.contact && <span>負責人/聯絡人：{item.contact}</span>}
                  </div>
                )}
              </div>

              {/* Action Buttons & Footer */}
              <div className="mt-4 space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                {/* Address & Navigation */}
                {item.address && (
                  <div className="flex items-start gap-1.5 text-xs text-neutral-600 dark:text-neutral-300">
                    <span className="shrink-0 text-neutral-400">📍</span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name + " " + item.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="line-clamp-1 hover:text-teal-600 hover:underline dark:hover:text-teal-400"
                      title="在 Google Maps 查看位置"
                    >
                      {item.address}
                    </a>
                  </div>
                )}

                {/* Interactive Action Links */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {item.storeUrl && (
                    <a
                      href={item.storeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-amber-600 transition"
                      title={item.productNote || "前往公益商城 / 訂購禮盒"}
                    >
                      <span>🎁</span>
                      <span>公益商品 / 商城</span>
                    </a>
                  )}

                  {item.website && (
                    <a
                      href={item.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100 dark:bg-teal-950/60 dark:text-teal-300 dark:hover:bg-teal-900/80"
                    >
                      <span>🌐</span>
                      <span>
                        {item.website.includes("facebook.com") ? "Facebook 粉專" : "官方網站"}
                      </span>
                    </a>
                  )}

                  {item.phone && (
                    <a
                      href={`tel:${item.phone.replace(/[^0-9+]/g, "")}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                    >
                      <span>📞</span>
                      <span>{item.phone}</span>
                    </a>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-neutral-400 dark:text-neutral-500 pt-1">
                  <span>
                    {item.changeDate
                      ? `異動日期：${item.changeDate}`
                      : item.address && item.address.length > 6
                        ? "資料來源：台灣公益資訊中心"
                        : "資料來源：財政部"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          totalItems={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          itemLabel="筆組織"
        />
      )}
    </div>
  );
}
