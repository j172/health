"use client";

import { PAGE_SIZE_OPTIONS, type PageSizeOption } from "@/lib/hooks/usePagination";

export interface PaginationProps {
  page: number;
  pageSize: number;
  /** Total row count for the current filter/keyword — used to compute the page count. */
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSizeOption) => void;
  pageSizeOptions?: readonly PageSizeOption[];
  /** Noun shown after the total, e.g. "筆藥品" / "筆機構". Defaults to "筆". */
  itemLabel?: string;
}

/**
 * Presentational pagination bar for /tools list & map pages (issue #133): a page-size
 * switcher (30/50/100) plus prev/next + numbered page links. Deliberately has no
 * state of its own — pair it with `usePagination` (URL-backed) or any other page/
 * pageSize state of the caller's choosing.
 *
 * Styled to match the existing news `PaginationBar` (components/News/PaginationBar.tsx)
 * but built on buttons + callbacks rather than `<Link>`, since every /tools list is a
 * client component that fetches its own data — there is no server-rendered href to
 * navigate to, only local state to update.
 */
export default function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  itemLabel = "筆",
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  if (totalItems <= 0) return null;

  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  const navButtonClass =
    "rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-1 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";
  const pageButtonClass = (active: boolean) =>
    `rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
      active
        ? "bg-primary text-white shadow-xs"
        : "text-neutral-600 hover:bg-neutral-100 dark:text-slate-300 dark:hover:bg-slate-800"
    }`;

  return (
    <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500 dark:text-slate-400">
        <span>
          共 {totalItems} {itemLabel}・每頁
        </span>
        <div className="flex items-center gap-1.5">
          {pageSizeOptions.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onPageSizeChange(size)}
              aria-pressed={pageSize === size}
              className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                pageSize === size
                  ? "bg-primary font-bold text-white shadow-xs"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <nav aria-label="分頁" className="flex items-center gap-1.5 self-center sm:self-auto">
          <button type="button" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} className={navButtonClass}>
            ‹ 上一頁
          </button>

          {pages[0] > 1 && (
            <>
              <button type="button" onClick={() => onPageChange(1)} className={pageButtonClass(false)}>
                1
              </button>
              {pages[0] > 2 && <span className="px-0.5 text-xs text-neutral-400 dark:text-slate-500">...</span>}
            </>
          )}

          {pages.map((p) => (
            <button key={p} type="button" onClick={() => onPageChange(p)} className={pageButtonClass(p === currentPage)}>
              {p}
            </button>
          ))}

          {pages[pages.length - 1] < totalPages && (
            <>
              {pages[pages.length - 1] < totalPages - 1 && <span className="px-0.5 text-xs text-neutral-400 dark:text-slate-500">...</span>}
              <button type="button" onClick={() => onPageChange(totalPages)} className={pageButtonClass(false)}>
                {totalPages}
              </button>
            </>
          )}

          <button type="button" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} className={navButtonClass}>
            下一頁 ›
          </button>
        </nav>
      )}
    </div>
  );
}
