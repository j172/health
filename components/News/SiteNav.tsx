"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";

const CALCULATOR_TOOLS = TOOL_CATALOG.filter((t) => t.group === "calculator").map((t) => ({ href: `/tools/${t.slug}`, label: t.title }));
const FACILITY_TOOLS = TOOL_CATALOG.filter((t) => t.group === "facility").map((t) => ({ href: `/tools/${t.slug}`, label: t.title }));
const LTC_TOOLS = TOOL_CATALOG.filter((t) => t.group === "ltc").map((t) => ({ href: `/tools/${t.slug}`, label: t.title }));
const FOOD_TOOLS = TOOL_CATALOG.filter((t) => t.group === "food").map((t) => ({ href: `/tools/${t.slug}`, label: t.title }));

interface NavLinkItem {
  href: string;
  label: string;
}

// ─── Chevron icon ─────────────────────────────────────────────────────────────

const ChevronIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200">
    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
  </svg>
);

// ─── Desktop dropdown ──────────────────────────────────────────────────────────

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
        className="flex items-center gap-1 py-4 text-[14px] font-medium text-neutral-600 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {label}
        <ChevronIcon />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute left-0 top-full z-50 max-h-[70vh] min-w-[13rem] overflow-y-auto rounded-2xl border border-neutral-100 bg-white py-2 shadow-xl ring-1 ring-black/5"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block whitespace-nowrap px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-primary focus-visible:bg-neutral-50 focus-visible:text-primary focus-visible:outline-none"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Mobile group ──────────────────────────────────────────────────────────────

const MobileGroup = ({ label, items, onNavigate }: { label: string; items: NavLinkItem[]; onNavigate: () => void }) => (
  <div className="py-2">
    <p className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">{label}</p>
    <ul className="mt-1">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            onClick={onNavigate}
            className="block rounded-lg px-1 py-2 text-[15px] text-neutral-700 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

// ─── Main nav ──────────────────────────────────────────────────────────────────

export default function SiteNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const mobilePanelId = useId();
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  // Scroll-based shadow
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Escape to close mobile menu
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMobileOpen(false); toggleButtonRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const closeMobile = () => setMobileOpen(false);

  return (
    <div
      className={`sticky top-0 z-50 border-b bg-white/95 backdrop-blur-sm transition-shadow duration-300 ${
        scrolled ? "border-neutral-200 shadow-sm" : "border-transparent"
      }`}
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between gap-4">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Image src="/images/logo/j172tw-health-logo.png" alt="j172tw Health" width={32} height={32} className="h-8 w-8" />
            <span className="text-[15px] font-bold tracking-tight text-neutral-900">j172tw Health</span>
          </Link>

          {/* Desktop nav */}
          <nav aria-label="主要導覽" className="hidden items-center gap-1 text-sm font-medium md:flex">
            <Link href="/" className="rounded-lg px-3 py-2 text-[14px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              首頁
            </Link>
            <NavDropdown label="醫療院所" items={FACILITY_TOOLS} />
            <NavDropdown label="長照機構" items={LTC_TOOLS} />
            <NavDropdown label="食品營養" items={FOOD_TOOLS} />
            <NavDropdown label="健康工具" items={CALCULATOR_TOOLS} />
            {SOURCE_CATEGORIES.map((cat) => (
              <NavDropdown
                key={cat.key}
                label={cat.label}
                items={cat.sources.map((s) => ({ href: `/news?source=${encodeURIComponent(s.sourceName)}`, label: s.label }))}
              />
            ))}
            {/* External link */}
            <a
              href="https://www.j172.tw"
              target="_blank"
              rel="noreferrer noopener"
              className="ml-1 rounded-lg px-3 py-2 text-[14px] font-medium text-neutral-500 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              j172.tw
            </a>
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Search icon */}
            <Link
              href="/news"
              aria-label="搜尋新聞"
              className="hidden items-center justify-center rounded-full p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:flex"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </Link>

            {/* Mobile hamburger */}
            <button
              ref={toggleButtonRef}
              type="button"
              aria-expanded={mobileOpen}
              aria-controls={mobilePanelId}
              aria-label={mobileOpen ? "關閉選單" : "開啟選單"}
              onClick={() => setMobileOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" className="h-6 w-6">
                {mobileOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile panel */}
        {mobileOpen && (
          <nav id={mobilePanelId} aria-label="行動裝置導覽" className="max-h-[75vh] overflow-y-auto border-t border-neutral-100 pb-4 md:hidden">
            <MobileGroup label="首頁" items={[{ href: "/", label: "首頁" }]} onNavigate={closeMobile} />
            <MobileGroup label="醫療院所" items={FACILITY_TOOLS} onNavigate={closeMobile} />
            <MobileGroup label="長照機構" items={LTC_TOOLS} onNavigate={closeMobile} />
            <MobileGroup label="食品營養" items={FOOD_TOOLS} onNavigate={closeMobile} />
            <MobileGroup label="健康工具" items={CALCULATOR_TOOLS} onNavigate={closeMobile} />
            {SOURCE_CATEGORIES.map((cat) => (
              <MobileGroup
                key={cat.key}
                label={cat.label}
                items={cat.sources.map((s) => ({ href: `/news?source=${encodeURIComponent(s.sourceName)}`, label: s.label }))}
                onNavigate={closeMobile}
              />
            ))}
            <div className="py-2">
              <a
                href="https://www.j172.tw"
                target="_blank"
                rel="noreferrer noopener"
                onClick={closeMobile}
                className="block rounded-lg px-1 py-2 text-[15px] text-neutral-700 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                j172.tw ↗
              </a>
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
