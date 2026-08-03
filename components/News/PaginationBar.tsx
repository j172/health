import Link from "next/link";

export const NEWS_PAGE_SIZE_OPTIONS = [30, 50, 100] as const;
export const DEFAULT_NEWS_PAGE_SIZE = 30;

export interface Pagination {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  sourceName?: string;
  keyword?: string;
  group?: string;
}

export default function PaginationBar({ pagination }: { pagination: Pagination }) {
  const { currentPage, totalPages, pageSize, sourceName, keyword, group } = pagination;

  const buildUrl = (page: number, size: number) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (size !== DEFAULT_NEWS_PAGE_SIZE) params.set("size", String(size));
    if (group) params.set("group", group);
    if (sourceName) params.set("source", sourceName);
    if (keyword) params.set("keyword", keyword);
    const str = params.toString();
    return `/news${str ? `?${str}` : ""}`;
  };

  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
      {/* Page Size Selector */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        <span>每頁顯示：</span>
        <div className="flex items-center gap-1.5">
          {NEWS_PAGE_SIZE_OPTIONS.map((size) => (
            <Link
              key={size}
              href={buildUrl(1, size)}
              className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                pageSize === size
                  ? "bg-indigo-600 font-bold text-white dark:bg-indigo-500 shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {size} 筆
            </Link>
          ))}
        </div>
      </div>

      {/* Page Navigation Buttons */}
      <nav aria-label="新聞分頁" className="flex items-center gap-1.5 self-center sm:self-auto">
        {currentPage > 1 && (
          <Link
            href={buildUrl(currentPage - 1, pageSize)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750"
          >
            ‹ 上一頁
          </Link>
        )}

        {pages[0] > 1 && (
          <>
            <Link
              href={buildUrl(1, pageSize)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              1
            </Link>
            {pages[0] > 2 && <span className="px-0.5 text-xs text-slate-400">...</span>}
          </>
        )}

        {pages.map((p) => (
          <Link
            key={p}
            href={buildUrl(p, pageSize)}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
              currentPage === p
                ? "bg-indigo-600 text-white dark:bg-indigo-500 shadow-xs"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {p}
          </Link>
        ))}

        {pages[pages.length - 1] < totalPages && (
          <>
            {pages[pages.length - 1] < totalPages - 1 && <span className="px-0.5 text-xs text-slate-400">...</span>}
            <Link
              href={buildUrl(totalPages, pageSize)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {totalPages}
            </Link>
          </>
        )}

        {currentPage < totalPages && (
          <Link
            href={buildUrl(currentPage + 1, pageSize)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750"
          >
            下一頁 ›
          </Link>
        )}
      </nav>
    </div>
  );
}
