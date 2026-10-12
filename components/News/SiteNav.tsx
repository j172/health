"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { buildNavModel, GUIDES, type NavModel } from "@/lib/server/tools/navModel";
import ThemeToggler from "@/components/Header/ThemeToggler";
import LanguageToggler from "@/components/Header/LanguageToggler";
import { useLanguage } from "@/app/context/LanguageContext";

const SearchModal = dynamic(() => import("@/components/Search/SearchModal"), {
  ssr: false,
});

interface NavLinkItem {
  href: string;
  label: string;
}

const ChevronIcon = () => (
  <svg
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
    className="h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200"
  >
    <path
      fillRule="evenodd"
      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
      clipRule="evenodd"
    />
  </svg>
);

/**
 * Escape-to-close, click-outside-to-close and focus-return, shared by both
 * disclosure menus below ("工具" mega menu, "生活情境" dropdown).
 *
 * This is deliberately NOT `components/ui/useModalA11y` (the hook
 * `SearchModal.tsx` uses): that hook implements a full *modal* dialog —
 * `role="dialog"`/`aria-modal`, Tab trapped inside, background scroll
 * locked. A nav disclosure is not modal: Tab must be free to carry on past
 * the menu into the rest of the page, the background stays interactive, and
 * nothing should lock page scroll. The WAI-ARIA Disclosure (Navigation)
 * pattern only asks for Escape-to-close, outside-click-to-close, and
 * returning focus to the trigger — so this is a small dedicated hook for
 * exactly that, instead of forcing the modal hook to fit a non-modal job.
 */
function useDisclosure({
  open,
  onClose,
  triggerRef,
  containerRef,
}: {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, onClose, triggerRef, containerRef]);
}

/**
 * Arrow-key roving focus within an open menu: ArrowDown/ArrowUp move between
 * `selector` matches inside `containerRef` in DOM order, Home/End jump to the
 * first/last. Scoped to whichever element the caller attaches `onKeyDown`
 * to, so it never intercepts arrow keys typed into the mega menu's filter
 * input (that element isn't inside the scoped container).
 */
function handleMenuArrowKeys(
  event: React.KeyboardEvent<HTMLElement>,
  containerRef: React.RefObject<HTMLElement | null>,
  selector: string,
) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const root = containerRef.current;
  if (!root) return;
  const items = Array.from(root.querySelectorAll<HTMLElement>(selector));
  if (items.length === 0) return;

  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  event.preventDefault();

  let nextIndex = currentIndex;
  if (event.key === "ArrowDown") {
    nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
  } else if (event.key === "ArrowUp") {
    nextIndex =
      currentIndex < 0
        ? items.length - 1
        : (currentIndex - 1 + items.length) % items.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = items.length - 1;
  }
  items[nextIndex]?.focus();
}

/**
 * Narrow disclosure dropdown (used for "生活情境"): a trigger button plus a
 * `role="menu"` popup of plain links. Click/Enter/Space opens (native button
 * activation covers both pointer and keyboard); ArrowDown on the closed
 * trigger also opens it. Escape, outside click and link selection all close
 * it and return focus to the trigger.
 */
const NavDropdown = ({
  label,
  items,
}: {
  label: string;
  items: NavLinkItem[];
}) => {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDisclosure({ open, onClose: close, triggerRef, containerRef });

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
      >
        {label}
        <ChevronIcon />
      </button>
      <div
        id={menuId}
        role="menu"
        aria-label={label}
        hidden={!open}
        onKeyDown={(event) =>
          handleMenuArrowKeys(event, containerRef, '[role="menuitem"]')
        }
        className="absolute top-full left-0 z-50 max-h-[70vh] min-w-[13rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-2 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            role="menuitem"
            onClick={close}
            className="block px-4 py-2 text-xs font-medium whitespace-nowrap text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
};

interface ToolsMegaMenuProps {
  categories: NavModel;
  triggerLabel: string;
  filterPlaceholder: string;
  filterSrLabel: string;
  noResultsTemplate: string;
}

/**
 * The "工具" mega menu (issue #460): a wide disclosure panel listing all 7
 * `buildNavModel()` categories with their full tool lists, plus a
 * client-side live-filter text input. Follows the WAI-ARIA Disclosure
 * Navigation pattern (https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
 * navigation example): the trigger is a plain button with
 * `aria-expanded`/`aria-haspopup`/`aria-controls`, and the panel is a `<nav>`
 * landmark of `<h3>` category headings (not `role="menu"`/`menuitem` — this
 * is a navigation region, not an application menu widget, so screen reader
 * users can jump between categories with heading navigation).
 *
 * Trigger mechanism: click/Enter/Space only — deliberately no hover-to-open.
 * Hover-only mega menus are a common accessibility/touch anti-pattern
 * (they flash open on an incidental mouse pass-through and have no
 * equivalent on touchscreens); a single click-based activation model keeps
 * pointer, keyboard and touch all behaving identically.
 */
const ToolsMegaMenu = ({
  categories,
  triggerLabel,
  filterPlaceholder,
  filterSrLabel,
  noResultsTemplate,
}: ToolsMegaMenuProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const panelId = useId();
  const filterInputId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const linksNavRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);
  useDisclosure({ open, onClose: close, triggerRef, containerRef });

  // Move focus into the filter input whenever the panel opens, so keyboard
  // users land somewhere immediately useful instead of needing an extra Tab.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => filterInputRef.current?.focus(), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Client-side filter against the already-loaded buildNavModel() data — no
  // network call. A category whose own label matches keeps its full tool
  // list; otherwise it's narrowed to just the matching tools, and dropped
  // entirely once empty.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((category) => {
        const categoryMatches = category.label.toLowerCase().includes(q);
        const tools = categoryMatches
          ? category.tools
          : category.tools.filter((tool) =>
              tool.label.toLowerCase().includes(q),
            );
        return { ...category, tools };
      })
      .filter((category) => category.tools.length > 0);
  }, [categories, query]);

  const totalMatches = useMemo(
    () => filtered.reduce((sum, category) => sum + category.tools.length, 0),
    [filtered],
  );
  const trimmedQuery = query.trim();
  const noResultsMessage = noResultsTemplate.replace("{query}", trimmedQuery);

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
      >
        {triggerLabel}
        <ChevronIcon />
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute top-full left-1/2 z-50 mt-1 w-[min(94vw,68rem)] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        <form role="search" onSubmit={(event) => event.preventDefault()} className="mb-4">
          <label htmlFor={filterInputId} className="sr-only">
            {filterSrLabel}
          </label>
          <div className="relative">
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={filterInputRef}
              id={filterInputId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={filterPlaceholder}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  const first =
                    linksNavRef.current?.querySelector<HTMLElement>("a[href]");
                  first?.focus();
                }
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm text-slate-800 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <p role="status" aria-live="polite" className="sr-only">
            {trimmedQuery
              ? totalMatches > 0
                ? `${totalMatches} 個工具符合「${trimmedQuery}」`
                : noResultsMessage
              : ""}
          </p>
        </form>

        {trimmedQuery && filtered.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-slate-600 dark:text-slate-400">
            {noResultsMessage}
          </p>
        ) : (
          <nav
            ref={linksNavRef}
            aria-label={triggerLabel}
            onKeyDown={(event) =>
              handleMenuArrowKeys(event, linksNavRef, "a[href]")
            }
            className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-4"
          >
            {filtered.map((category) => (
              <div key={category.group}>
                <h3 className="mb-1.5 text-xs font-bold tracking-wide text-indigo-600 uppercase dark:text-indigo-400">
                  <Link href={category.href} onClick={close} className="hover:underline">
                    {category.label}
                  </Link>
                </h3>
                <ul className="space-y-1">
                  {category.tools.map((tool) => (
                    <li key={tool.slug}>
                      <Link
                        href={tool.href}
                        onClick={close}
                        className="block rounded-md px-1 py-0.5 text-xs font-medium text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
                      >
                        {tool.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
};

export default function SiteNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const mobilePanelId = useId();
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const { t, locale } = useLanguage();

  // Catalog-derived nav model (issue #443's buildNavModel()): exactly 7
  // categories, each pre-sorted via compareByStrokeOrder. The desktop "工具"
  // mega menu renders this directly; the mobile drawer below (kept working
  // as-is per #473 — "手機底部固定導覽列" — which will redesign it into a
  // bottom nav bar) reuses the same 7 sections instead of hand-rolling a
  // second copy, so the two can never drift apart.
  const navModel: NavModel = useMemo(
    () =>
      buildNavModel({
        locale,
        translateGroupLabel: (meta) => t(meta.labelKey, meta.labelDefault),
        translateToolLabel: (tool) => {
          const zhLabel = tool.navLabel ?? tool.title;
          return locale !== "zh-TW"
            ? t(`catalog.${tool.slug}`, zhLabel)
            : zhLabel;
        },
      }),
    [locale, t],
  );

  // The 5 life-situation guide hubs (issue #438 §3.3 / navModel.ts's
  // `GUIDES`). The `/guides/[slug]` pages themselves don't exist yet (a
  // separate future ticket builds them) — this nav already points at their
  // final URLs.
  const guideLinks: NavLinkItem[] = useMemo(
    () =>
      GUIDES.map((guide) => ({
        href: `/guides/${guide.slug}`,
        label: t(`guides.${guide.slug}.title`, guide.title),
      })),
    [t],
  );

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Keyboard shortcut Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <header
        id="header-nav"
        role="banner"
        className={`sticky top-0 z-50 border-b bg-white/90 backdrop-blur-md transition-all duration-300 dark:bg-slate-950/90 ${
          scrolled
            ? "border-slate-200 shadow-xs dark:border-slate-800"
            : "border-slate-100 dark:border-slate-900"
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <a
            href="#header-nav"
            id="accesskey-u"
            accessKey="U"
            title="上方導覽區 (Alt+U)"
            className="sr-only"
          >
            ::: 上方導覽區
          </a>
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Logo — also serves as the "首頁" entry point (issue #460
                removed the separate "首頁" nav item; the logo already linked
                here, so no change was needed for that). */}
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/images/logo/j172tw-health-logo.png"
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 rounded-xl shadow-xs"
              />
              <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                j172tw{" "}
                <span className="text-indigo-600 dark:text-indigo-400">
                  Healthz
                </span>
              </span>
            </Link>

            {/* Desktop Navigation (issue #460): exactly 5 top-level items at
                ≥1024px — 新聞｜工具▾｜生活情境▾｜我附近｜🚨緊急. Below 1024px
                the hamburger drawer takes over (unchanged scope, #473). */}
            <nav
              aria-label="主要導覽"
              className="hidden items-center gap-1.5 lg:flex"
            >
              <Link
                href="/news"
                className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
              >
                {t("nav.news", "最新新聞")}
              </Link>

              <ToolsMegaMenu
                categories={navModel}
                triggerLabel={t("nav.tools", "健康與生活工具")}
                filterPlaceholder={t(
                  "nav.toolsFilterPlaceholder",
                  "搜尋工具名稱...",
                )}
                filterSrLabel={t("nav.toolsFilterLabel", "篩選工具")}
                noResultsTemplate={t(
                  "nav.toolsFilterNoResults",
                  "沒有符合「{query}」的工具",
                )}
              />

              <NavDropdown label={t("nav.guides", "生活情境")} items={guideLinks} />

              <Link
                href="/nearby"
                className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
              >
                {t("nav.nearby", "我附近")}
              </Link>

              {/* Emergency Hotlines Quick Entry — unchanged destination and
                  styling, exactly as it already was before this ticket. */}
              <Link
                href="/tools/emergency-hotlines"
                className="flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50/90 px-2.5 py-1 text-xs font-bold text-rose-700 shadow-2xs transition-all hover:bg-rose-100 hover:border-rose-400 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900/60"
                title="全臺急用緊急專線速查與直撥 (110, 119, 112, 1999)"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500"></span>
                </span>
                <span className="whitespace-nowrap">🚨 <span className="hidden xs:inline">緊急電話</span></span>
              </Link>
            </nav>

            {/* Right Actions (Search Button + Theme Toggler) */}
            <div className="flex items-center gap-2.5 sm:gap-3">
              {/* Cmd+K Search Trigger */}
              <button
                id="search-trigger"
                accessKey="S"
                aria-label="搜尋新聞與工具 (Alt+S)"
                title="搜尋新聞與工具 (Alt+S 或 ⌘K)"
                onClick={() => setSearchOpen(true)}
                className="dark:hover:bg-slate-850 flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs text-slate-600 shadow-xs transition-all hover:border-indigo-300 hover:bg-white hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:text-indigo-400"
              >
                <svg
                  className="h-4 w-4 text-indigo-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <span className="sr-only sm:not-sr-only sm:inline">
                  {t("nav.searchPlaceholder", "搜尋新聞...")}
                </span>
                <kbd className="hidden rounded bg-slate-200/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 sm:inline-block dark:bg-slate-800 dark:text-slate-400">
                  ⌘K
                </kbd>
              </button>

              {/* Language Switcher & Theme Toggler */}
              <LanguageToggler />
              <ThemeToggler />

              {/* Mobile Hamburger */}
              <button
                ref={toggleButtonRef}
                type="button"
                aria-expanded={mobileOpen}
                aria-controls={mobilePanelId}
                aria-label={
                  mobileOpen
                    ? t("nav.closeMenu", "關閉選單")
                    : t("nav.openMenu", "開啟選單")
                }
                onClick={() => setMobileOpen((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 lg:hidden dark:border-slate-800 dark:text-slate-300"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="h-5 w-5"
                >
                  {mobileOpen ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
                    />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer. Out of scope for issue #460 (a separate
            ticket, #473, redesigns this into a bottom nav bar below 1024px)
            — kept working as-is, with one low-risk bonus: it now reads from
            the same `navModel`/`guideLinks` as the desktop mega menu instead
            of a second hand-rolled 9-group copy, so it already reflects the
            new 7-category structure without any extra logic. */}
        {mobileOpen && (
          <div
            id={mobilePanelId}
            className="max-h-[75vh] overflow-y-auto border-t border-slate-100 bg-white p-4 lg:hidden dark:border-slate-800 dark:bg-slate-950"
          >
            {/* Pinned Emergency Quick Dial in Mobile Drawer */}
            <div className="mb-3">
              <Link
                href="/tools/emergency-hotlines"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-sm font-bold text-rose-700 shadow-2xs transition-all hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
              >
                <span className="flex items-center gap-2">
                  <span className="text-base">🚨</span>
                  <span>全臺急用緊急電話速查 (110/119/1999)</span>
                </span>
                <span className="text-xs font-semibold text-rose-500">直撥 ➔</span>
              </Link>
            </div>

            <div className="flex flex-col gap-2 text-sm font-semibold">
              <Link
                href="/news"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-slate-700 dark:text-slate-200"
              >
                {t("nav.news", "最新新聞")}
              </Link>
              <Link
                href="/nearby"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-slate-700 dark:text-slate-200"
              >
                {t("nav.nearby", "我附近")}
              </Link>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
              <p className="px-2 text-xs font-bold tracking-wider text-slate-600 uppercase dark:text-slate-500">
                {t("nav.guides", "生活情境")}
              </p>
              <div className="mt-1 flex flex-col gap-1">
                {guideLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg p-2 text-sm font-medium text-slate-600 dark:text-slate-300"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            {navModel.map((category) => (
              <div
                key={category.group}
                className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800"
              >
                <p className="px-2 text-xs font-bold tracking-wider text-slate-600 uppercase dark:text-slate-500">
                  {category.label}
                </p>
                <div className="mt-1 flex flex-col gap-1">
                  {category.tools.map((tool) => (
                    <Link
                      key={tool.slug}
                      href={tool.href}
                      onClick={() => setMobileOpen(false)}
                      className="rounded-lg p-2 text-sm font-medium text-slate-600 dark:text-slate-300"
                    >
                      {tool.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </header>

      {/* Modal Search */}
      {searchOpen ? (
        <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      ) : null}
    </>
  );
}
