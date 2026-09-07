"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Site-wide page-size choices for list/map tool pages (issue #133): default 30,
 * switchable to 50 or 100. Keep this the single source of truth — every page that
 * paginates should offer exactly these three sizes rather than inventing its own.
 */
export const PAGE_SIZE_OPTIONS = [30, 50, 100] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSizeOption = 30;

export interface UsePaginationOptions {
  /** Page size used when the URL carries none, or an unrecognized value. Must be one of PAGE_SIZE_OPTIONS. */
  defaultPageSize?: PageSizeOption;
  /** Query-string param names — override only if a single page needs two independent paginated lists. */
  pageParam?: string;
  pageSizeParam?: string;
}

export interface UsePaginationResult {
  /** 1-based current page. */
  page: number;
  pageSize: PageSizeOption;
  /** (page - 1) * pageSize — convenience for building an API `offset`/`OFFSET`. */
  offset: number;
  setPage: (page: number) => void;
  /** Changing page size also resets to page 1 — a stale page number past the new last page reads as "no results". */
  setPageSize: (size: PageSizeOption) => void;
  pageSizeOptions: readonly PageSizeOption[];
}

/**
 * Page/page-size state for list & map tool pages, kept in the URL query string
 * (`?page=&pageSize=`) via `router.replace` (no full navigation, `scroll: false`)
 * so results stay shareable and survive a refresh — see issue #133.
 *
 * Scope is deliberately narrow: this hook only owns pagination *state*. It does not
 * fetch, slice, or sort anything, and it has no opinion on what "page 1" means.
 * That split matters for the 地圖類/列表類 distinction the issue calls out:
 *   - 列表類 (plain list) pages want 最新 N 筆 → caller queries `ORDER BY id DESC` (or
 *     equivalent "newest first") and passes this hook's `offset`/`pageSize` as
 *     `LIMIT ? OFFSET ?`.
 *   - 地圖類 (map/GPS) pages want 最近 N 筆 → caller queries `ORDER BY distance_km ASC`
 *     and passes the same `offset`/`pageSize`.
 * Both cases are "the caller decides the order, this hook decides which slice."
 *
 * Requires a `<Suspense>` ancestor when the page can be statically rendered (Next.js
 * requirement for `useSearchParams`); every current call site already opts into
 * `export const dynamic = "force-dynamic"`, which does not need one.
 */
export function usePagination(options: UsePaginationOptions = {}): UsePaginationResult {
  const { defaultPageSize = DEFAULT_PAGE_SIZE, pageParam = "page", pageSizeParam = "pageSize" } = options;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = useMemo(() => {
    const raw = Number(searchParams.get(pageParam));
    return Number.isInteger(raw) && raw > 0 ? raw : 1;
  }, [searchParams, pageParam]);

  const pageSize = useMemo(() => {
    const raw = Number(searchParams.get(pageSizeParam));
    return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw) ? (raw as PageSizeOption) : defaultPageSize;
  }, [searchParams, pageSizeParam, defaultPageSize]);

  const updateParams = useCallback(
    (next: { page?: number; pageSize?: number }) => {
      const params = new URLSearchParams(searchParams.toString());
      const nextPage = next.page ?? page;
      const nextPageSize = next.pageSize ?? pageSize;

      // Keep the URL clean at defaults rather than always stamping ?page=1&pageSize=30.
      if (nextPage > 1) params.set(pageParam, String(nextPage));
      else params.delete(pageParam);

      if (nextPageSize !== defaultPageSize) params.set(pageSizeParam, String(nextPageSize));
      else params.delete(pageSizeParam);

      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [searchParams, page, pageSize, pageParam, pageSizeParam, defaultPageSize, pathname, router],
  );

  const setPage = useCallback((nextPage: number) => updateParams({ page: nextPage }), [updateParams]);

  const setPageSize = useCallback(
    (nextPageSize: PageSizeOption) => updateParams({ pageSize: nextPageSize, page: 1 }),
    [updateParams],
  );

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    setPage,
    setPageSize,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  };
}
