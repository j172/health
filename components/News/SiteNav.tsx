"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";
import ThemeToggler from "@/components/Header/ThemeToggler";
import SearchModal from "@/components/Search/SearchModal";

const CALCULATOR_TOOLS = TOOL_CATALOG.filter((t) => t.group === "calculator").map((t) => ({ href: `/tools/${t.slug}`, label: t.title }));
const FACILITY_TOOLS = TOOL_CATALOG.filter((t) => t.group === "facility").map((t) => ({ href: `/tools/${t.slug}`, label: t.title }));
const LTC_TOOLS = TOOL_CATALOG.filter((t) => t.group === "ltc").map((t) => ({ href: `/tools/${t.slug}`, label: t.title }));
const FOOD_TOOLS = TOOL_CATALOG.filter((t) => t.group === "food").map((t) => ({ href: `/tools/${t.slug}`, label: t.title }));

interface NavLinkItem {
  href: string;
  label: string;
}

const ChevronIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200">
    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
  </svg>
);

const NavDropdown = ({ label, items }: { label: string; items: NavLinkItem[] }) => {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => { if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 py-4 text-xs font-semibold text-slate-600 transition-colors hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
      >
        {label}
        <ChevronIcon />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute left-0 top-full z-50 max-h-[70vh] min-w-[13rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-2 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block whitespace-nowrap px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default function SiteNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const mobilePanelId = useId();
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

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
      <div
        className={`sticky top-0 z-50 border-b bg-white/90 backdrop-blur-md transition-all duration-300 dark:bg-slate-950/90 ${
          scrolled
            ? "border-slate-200 shadow-xs dark:border-slate-800"
            : "border-slate-100 dark:border-slate-900"
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/images/logo/j172tw-health-logo.png"
                alt="j172tw Health"
                width={36}
                height={36}
                className="h-9 w-9 rounded-xl shadow-xs"
              />
              <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                j172tw <span className="text-indigo-600 dark:text-indigo-400">Health</span>
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav aria-label="主要導覽" className="hidden items-center gap-1.5 md:flex">
              <Link
                href="/"
                className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
              >
                首頁
              </Link>
              <Link
                href="/news"
                className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
              >
                最新新聞
              </Link>
              <Link
                href="/tools/aqi"
                className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
              >
                即時空品 (AQI)
              </Link>
              <NavDropdown label="醫療院所" items={FACILITY_TOOLS} />
              <NavDropdown label="長照機構" items={LTC_TOOLS} />
              <NavDropdown label="健康工具" items={CALCULATOR_TOOLS} />
            </nav>

            {/* Right Actions (Search Button + Theme Toggler) */}
            <div className="flex items-center gap-3">
              {/* Cmd+K Search Trigger */}
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs text-slate-400 hover:border-indigo-300 hover:bg-white hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-850 dark:hover:text-indigo-400 transition-all shadow-xs"
              >
                <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="hidden sm:inline">搜尋新聞...</span>
                <kbd className="hidden sm:inline-block rounded bg-slate-200/60 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  ⌘K
                </kbd>
              </button>

              {/* Theme Toggler */}
              <ThemeToggler />

              {/* Mobile Hamburger */}
              <button
                ref={toggleButtonRef}
                type="button"
                aria-expanded={mobileOpen}
                aria-controls={mobilePanelId}
                onClick={() => setMobileOpen((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-300 md:hidden"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                  {mobileOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileOpen && (
          <div id={mobilePanelId} className="border-t border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 md:hidden">
            <div className="flex flex-col gap-2 text-sm font-semibold">
              <Link href="/" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-slate-700 dark:text-slate-200">
                首頁
              </Link>
              <Link href="/news" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-slate-700 dark:text-slate-200">
                最新新聞
              </Link>
              <Link href="/tools/aqi" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-slate-700 dark:text-slate-200">
                即時空品 (AQI)
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Modal Search */}
      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
