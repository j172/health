"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import LoadingOrb from "@/components/ui/LoadingOrb";
import Pagination from "@/components/Tools/Pagination";
import { usePagination, type PageSizeOption } from "@/lib/hooks/usePagination";
import type { PetAdoptionItem } from "@/lib/server/petAdoption/types";

const TAIWAN_CITIES = [
  "全台縣市",
  "基隆市",
  "臺北市",
  "新北市",
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

export default function PetAdoptionContent() {
  const [kind, setKind] = useState<string>("all");
  const [sex, setSex] = useState<string>("all");
  const [bodytype, setBodytype] = useState<string>("all");
  const [city, setCity] = useState<string>("全台縣市");
  const [keyword, setKeyword] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");

  const [items, setItems] = useState<PetAdoptionItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [totalAll, setTotalAll] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  const { page, pageSize, setPage, setPageSize } = usePagination();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const query = new URLSearchParams();
    if (kind !== "all") query.set("kind", kind);
    if (sex !== "all") query.set("sex", sex);
    if (bodytype !== "all") query.set("bodytype", bodytype);
    if (city !== "全台縣市") query.set("city", city);
    if (keyword) query.set("keyword", keyword);
    query.set("page", String(page));
    query.set("limit", String(pageSize));

    fetch(`/api/pet-adoptions?${query.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setItems(data.items || []);
          setTotal(data.total || 0);
          setTotalAll(data.totalAll || 0);
          setError(false);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [kind, sex, bodytype, city, keyword, page, pageSize]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setKeyword(searchInput.trim());
    setPage(1);
  };

  const getSexBadge = (s: string) => {
    if (s === "M") {
      return <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-950/80 dark:text-sky-300">👦 男孩</span>;
    }
    if (s === "F") {
      return <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/80 dark:text-rose-300">👧 女孩</span>;
    }
    return <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">未知</span>;
  };

  const getBodytypeLabel = (b?: string | null) => {
    if (b === "SMALL") return "小型";
    if (b === "MEDIUM") return "中型";
    if (b === "BIG") return "大型";
    return b || "未知";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="mb-2 flex items-center gap-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">
          <span>🐶🐱</span> 全台毛孩認領養查詢
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">
          即時查詢全國各縣市公立動物收容所等待認養之犬貓與各類毛小孩。資料來源：農業部動物保護資訊網開放資料。
        </p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
          💡 請以領養代替購買！認養前請詳閱收容所規範，歡迎點擊電話撥打預約現場互動。
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-5">
        {/* Kind selector tabs */}
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            { key: "all", label: "全部毛孩" },
            { key: "狗", label: "🐶 狗狗" },
            { key: "貓", label: "🐱 貓咪" },
            { key: "其他", label: "🐰 其他動物" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setKind(tab.key);
                setPage(1);
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                kind === tab.key
                  ? "bg-amber-500 text-white shadow-sm hover:bg-amber-600"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search and drop-down filters */}
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜尋品種、收容所名稱或備註"
            className="min-w-[200px] flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-800 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />

          <select
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setPage(1);
            }}
            aria-label="選擇縣市"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            {TAIWAN_CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={sex}
            onChange={(e) => {
              setSex(e.target.value);
              setPage(1);
            }}
            aria-label="選擇性別"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="all">全部性別</option>
            <option value="M">男孩 (公)</option>
            <option value="F">女孩 (母)</option>
          </select>

          <select
            value={bodytype}
            onChange={(e) => {
              setBodytype(e.target.value);
              setPage(1);
            }}
            aria-label="選擇體型"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="all">全部體型</option>
            <option value="SMALL">小型</option>
            <option value="MEDIUM">中型</option>
            <option value="BIG">大型</option>
          </select>

          <button
            type="submit"
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 transition-colors"
          >
            搜尋
          </button>
        </form>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-slate-400">
        <div>
          符合條件：<span className="font-semibold text-neutral-800 dark:text-slate-200">{total}</span> 隻
          {totalAll > 0 && <span>（全台收容所共 {totalAll} 隻）</span>}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500 dark:text-slate-400 text-sm">
          <LoadingOrb size={32} />
          <span>正在載入最新認領養毛孩名單...</span>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          查詢動物認領養資料失敗，請稍後再試。
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-12 text-center text-neutral-500 dark:border-slate-700 dark:text-slate-400">
          <p className="text-4xl mb-3">🐾</p>
          <p className="text-base font-medium">目前篩選條件下查無等待認養的毛小孩。</p>
          <p className="text-xs mt-1">您可以嘗試切換至「全台縣市」或放寬品種與體型條件。</p>
        </div>
      ) : (
        <>
          {/* Card Grid */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((pet) => (
              <div
                key={pet.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                {/* Photo container */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-100 dark:bg-slate-800">
                  {pet.album_file ? (
                    <img
                      src={pet.album_file}
                      alt={pet.animal_variety || pet.animal_kind}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23f5f5f5' width='100' height='100'/%3E%3Ctext fill='%23aaa' font-size='32' x='50' y='60' text-anchor='middle'%3E🐾%3C/text%3E%3C/svg%3E";
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-5xl text-neutral-300 dark:text-slate-700">
                      🐾
                    </div>
                  )}

                  {/* Status / Kind badge on top */}
                  <div className="absolute left-3 top-3 flex flex-wrap gap-1">
                    <span className="rounded-full bg-neutral-900/80 px-2.5 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
                      {pet.animal_kind === "狗" ? "🐕 狗" : pet.animal_kind === "貓" ? "🐈 貓" : "🐾 " + pet.animal_kind}
                    </span>
                    {pet.city && (
                      <span className="rounded-full bg-amber-500/90 px-2.5 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
                        📍 {pet.city}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Content */}
                <div className="flex flex-1 flex-col p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-base font-bold text-neutral-800 dark:text-slate-100">
                      {pet.animal_variety || "混種"}
                    </h3>
                    <div>{getSexBadge(pet.animal_sex)}</div>
                  </div>

                  {/* Attribute tags */}
                  <div className="mb-3 flex flex-wrap gap-1.5 text-xs text-neutral-600 dark:text-slate-300">
                    <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-slate-800">
                      體型：{getBodytypeLabel(pet.animal_bodytype)}
                    </span>
                    {pet.animal_age && (
                      <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-slate-800">
                        {pet.animal_age === "CHILD" ? "幼年" : "成年"}
                      </span>
                    )}
                    {pet.animal_colour && (
                      <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-slate-800">
                        {pet.animal_colour}
                      </span>
                    )}
                    <span
                      className={`rounded px-2 py-0.5 font-medium ${
                        pet.animal_sterilization === "T"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
                          : "bg-neutral-100 text-neutral-500 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {pet.animal_sterilization === "T" ? "已結紮" : "未結紮"}
                    </span>
                  </div>

                  {/* Remarks / Foundplace */}
                  {(pet.animal_remark || pet.animal_foundplace) && (
                    <p className="mb-3 line-clamp-2 text-xs text-neutral-500 dark:text-slate-400">
                      {pet.animal_remark || `尋獲地點：${pet.animal_foundplace}`}
                    </p>
                  )}

                  {/* Shelter info & Action footer */}
                  <div className="mt-auto border-t border-neutral-100 pt-3 dark:border-slate-800">
                    <div className="mb-1 text-xs font-semibold text-neutral-700 dark:text-slate-300 truncate">
                      🏢 {pet.shelter_name || "公立收容所"}
                    </div>
                    {pet.shelter_address && (
                      <div className="mb-2 text-xs text-neutral-500 dark:text-slate-400 truncate">
                        {pet.shelter_address}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {pet.shelter_tel ? (
                        <a
                          href={`tel:${pet.shelter_tel.replace(/[^\d#]/g, "")}`}
                          className="flex-1 rounded-lg bg-amber-50 px-3 py-1.5 text-center text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-900/60 transition-colors"
                        >
                          📞 致電預約認養
                        </a>
                      ) : null}
                      {pet.shelter_address ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            (pet.shelter_name ? pet.shelter_name + " " : "") + pet.shelter_address
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                          title="在 Google Maps 查看位置"
                        >
                          🧭 導航
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-8">
            <Pagination
              page={page}
              pageSize={pageSize}
              totalItems={total}
              onPageChange={(p) => {
                setPage(p);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              onPageSizeChange={(s) => {
                setPageSize(s as PageSizeOption);
                setPage(1);
              }}
              itemLabel="隻毛孩"
            />
          </div>
        </>
      )}
    </div>
  );
}
