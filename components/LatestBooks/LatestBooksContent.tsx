"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import LoadingOrb from "@/components/ui/LoadingOrb";
import Pagination from "@/components/Tools/Pagination";
import { usePagination } from "@/lib/hooks/usePagination";
import type { BookItem, BookCategoryConfig, BookPlatform } from "@/lib/server/books/types";

export default function LatestBooksContent() {
  const [platform, setPlatform] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchInput, setSearchInput] = useState<string>("");
  const [activeQuery, setActiveQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("ranking");

  const [books, setBooks] = useState<BookItem[]>([]);
  const [categories, setCategories] = useState<BookCategoryConfig[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [dataSource, setDataSource] = useState<string>("database");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  const { page, pageSize, setPage, setPageSize } = usePagination();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams();
    if (platform !== "all") params.set("platform", platform);
    if (selectedCategory !== "all") params.set("categoryId", selectedCategory);
    if (activeQuery) params.set("q", activeQuery);
    if (sortBy) params.set("sortBy", sortBy);
    params.set("page", String(page));
    params.set("limit", String(pageSize));

    fetch(`/api/books?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setBooks(data.books || []);
          setTotal(data.total || 0);
          if (data.categories) setCategories(data.categories);
          setDataSource(data.source || "database");
          setError(false);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Fetch books failed:", err);
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [platform, selectedCategory, activeQuery, sortBy, page, pageSize]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveQuery(searchInput.trim());
    setPage(1);
  };

  const handleClearFilters = () => {
    setPlatform("all");
    setSelectedCategory("all");
    setSearchInput("");
    setActiveQuery("");
    setSortBy("ranking");
    setPage(1);
  };

  const visibleCategories = categories.filter((c) => {
    if (platform === "all") return true;
    return c.platform === platform;
  });

  return (
    <div className="space-y-6">
      {/* Platform Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setPlatform("all");
              setSelectedCategory("all");
              setPage(1);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              platform === "all"
                ? "bg-indigo-600 text-white shadow-sm dark:bg-indigo-500"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            📚 全部通路
          </button>
          <button
            type="button"
            onClick={() => {
              setPlatform("books_com_tw");
              setSelectedCategory("all");
              setPage(1);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              platform === "books_com_tw"
                ? "bg-sky-600 text-white shadow-sm dark:bg-sky-500"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            📖 博客來暢銷榜 (4大類)
          </button>
          <button
            type="button"
            onClick={() => {
              setPlatform("eslite");
              setSelectedCategory("all");
              setPage(1);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              platform === "eslite"
                ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            🌿 誠品線上選書 (27大類)
          </button>
        </div>

        {/* Sort selector */}
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>排序方式：</span>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-800 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value="ranking">🏆 暢銷名次</option>
            <option value="publishDate">📅 最新出版</option>
            <option value="priceAsc">💰 價格由低到高</option>
            <option value="priceDesc">💎 價格由高到低</option>
          </select>
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-1">
        <button
          type="button"
          onClick={() => {
            setSelectedCategory("all");
            setPage(1);
          }}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            selectedCategory === "all"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:text-zinc-400 dark:hover:bg-zinc-700"
          }`}
        >
          全部類別
        </button>
        {visibleCategories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setSelectedCategory(cat.id);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                isSelected
                  ? "bg-indigo-600 text-white dark:bg-indigo-500"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {cat.platform === "books_com_tw" ? "博客來・" : "誠品・"}
              {cat.name}
            </button>
          );
        })}
      </div>

      {/* Search Input Bar */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜尋書名、作者、出版社或類別關鍵字（如：原子習慣、營養、長照、心理）..."
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 pl-10 text-sm text-zinc-800 placeholder-zinc-400 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <span className="pointer-events-none absolute left-3.5 top-3 text-zinc-400">
            🔍
          </span>
        </div>
        <button
          type="submit"
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          搜尋
        </button>
        {(activeQuery || selectedCategory !== "all" || platform !== "all") && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            重置
          </button>
        )}
      </form>

      {/* Status & Results Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <div>
          共找到 <span className="font-semibold text-zinc-900 dark:text-zinc-100">{total}</span> 本推薦與暢銷書籍
          {activeQuery && <span>（搜尋：「{activeQuery}」）</span>}
        </div>
        {dataSource === "offline_seed" && (
          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/70 dark:text-amber-300">
            ⚡ 離線靜態高可用模式（資料同步備援）
          </span>
        )}
      </div>

      {/* Main Grid View */}
      {loading ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
          <LoadingOrb />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">載入最新書籍資訊中...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-semibold">載入書籍資料時發生錯誤</p>
          <button
            type="button"
            onClick={() => setPage(page)}
            className="mt-3 rounded-lg bg-red-600 px-4 py-1.5 text-xs text-white shadow hover:bg-red-700"
          >
            重新嘗試
          </button>
        </div>
      ) : books.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 p-12 text-center text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <p className="text-base font-semibold">查無符合條件的書籍</p>
          <p className="mt-1 text-xs">請嘗試更換關鍵字或切換其他書籍分類。</p>
          <button
            type="button"
            onClick={handleClearFilters}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow transition hover:bg-indigo-700"
          >
            清除篩選條件
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {books.map((book, idx) => {
            const isBooksComTw = book.platform === "books_com_tw";
            return (
              <div
                key={`${book.platform}-${book.categoryId}-${book.productUrl}-${idx}`}
                className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div>
                  {/* Card Header & Badges */}
                  <div className="mb-3 flex items-center justify-between gap-1 text-xs">
                    <div className="flex items-center gap-1.5">
                      {book.ranking != null && (
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 font-bold text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                          TOP {book.ranking}
                        </span>
                      )}
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          isBooksComTw
                            ? "bg-sky-50 text-sky-700 dark:bg-sky-950/80 dark:text-sky-300"
                            : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300"
                        }`}
                      >
                        {isBooksComTw ? "博客來" : "誠品線上"}
                      </span>
                    </div>
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {book.categoryName}
                    </span>
                  </div>

                  {/* Book Cover Image */}
                  <div className="relative mb-3 flex h-48 w-full items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800/60">
                    {book.coverUrl ? (
                      <img
                        src={book.coverUrl}
                        alt={book.title}
                        className="max-h-full max-w-full object-contain transition duration-200 group-hover:scale-105"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-zinc-400">
                        <span className="text-3xl">📖</span>
                        <span className="mt-1 text-xs">暫無封面</span>
                      </div>
                    )}
                  </div>

                  {/* Title & Metadata */}
                  <h3
                    className="line-clamp-2 text-sm font-bold text-zinc-900 transition group-hover:text-indigo-600 dark:text-zinc-100 dark:group-hover:text-indigo-400"
                    title={book.title}
                  >
                    {book.title}
                  </h3>

                  <div className="mt-2 space-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {book.author && (
                      <p className="line-clamp-1">
                        <span className="text-zinc-400 dark:text-zinc-500">作者：</span>
                        {book.author}
                      </p>
                    )}
                    {book.publisher && (
                      <p className="line-clamp-1">
                        <span className="text-zinc-400 dark:text-zinc-500">出版：</span>
                        {book.publisher}
                      </p>
                    )}
                    {book.publishDate && (
                      <p className="text-[11px] text-zinc-400">
                        日期：{book.publishDate}
                      </p>
                    )}
                  </div>

                  {book.description && (
                    <p className="mt-2 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {book.description}
                    </p>
                  )}
                </div>

                {/* Footer Price & Action */}
                <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800/80">
                  <div className="mb-2 flex items-baseline justify-between">
                    <div>
                      {book.salePrice != null ? (
                        <span className="text-base font-bold text-red-600 dark:text-red-400">
                          NT$ {book.salePrice}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400">定價洽原站</span>
                      )}
                      {book.listPrice != null && book.listPrice > (book.salePrice ?? 0) && (
                        <span className="ml-1.5 text-xs text-zinc-400 line-through">
                          ${book.listPrice}
                        </span>
                      )}
                    </div>
                    {book.discount && (
                      <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-bold text-rose-600 dark:bg-rose-950/70 dark:text-rose-300">
                        {book.discount}
                      </span>
                    )}
                  </div>

                  <a
                    href={book.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-zinc-100 py-2 text-xs font-semibold text-zinc-800 transition hover:bg-indigo-50 hover:text-indigo-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300"
                  >
                    <span>前往{isBooksComTw ? "博客來" : "誠品"}選購</span>
                    <span className="text-xs">↗</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && total > pageSize && (
        <div className="pt-4">
          <Pagination
            page={page}
            totalItems={total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="本書籍"
          />
        </div>
      )}
    </div>
  );
}
