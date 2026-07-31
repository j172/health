"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";

const CALCULATOR_TOOLS = TOOL_CATALOG.filter((tool) => tool.group === "calculator").map((tool) => ({ href: `/tools/${tool.slug}`, label: tool.title }));
const FACILITY_TOOLS = TOOL_CATALOG.filter((tool) => tool.group === "facility").map((tool) => ({ href: `/tools/${tool.slug}`, label: tool.title }));
const LTC_TOOLS = TOOL_CATALOG.filter((tool) => tool.group === "ltc").map((tool) => ({ href: `/tools/${tool.slug}`, label: tool.title }));
const FOOD_TOOLS = TOOL_CATALOG.filter((tool) => tool.group === "food").map((tool) => ({ href: `/tools/${tool.slug}`, label: tool.title }));

interface NavLinkItem {
  href: string;
  label: string;
}

const ChevronIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5">
    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
  </svg>
);

/** Click/keyboard-operable dropdown (desktop) — the original nav used CSS group-hover only, which a keyboard user can never open. */
const NavDropdown = ({ label, items }: { label: string; items: NavLinkItem[] }) => {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 py-4 transition-colors hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {label}
        <ChevronIcon />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute left-0 top-full z-10 min-w-[12rem] max-h-[70vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block whitespace-nowrap px-4 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900 focus-visible:bg-neutral-50 focus-visible:text-neutral-900 focus-visible:outline-none"
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const MobileGroup = ({ label, items, onNavigate }: { label: string; items: NavLinkItem[]; onNavigate: () => void }) => (
  <div className="py-2">
    <p className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">{label}</p>
    <ul className="mt-1">
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            onClick={onNavigate}
            className="block rounded-md px-1 py-2 text-[15px] text-neutral-700 transition-colors hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

export default function SiteNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobilePanelId = useId();
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        toggleButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
      <div className="flex h-12 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <Image src="/images/logo/j172tw-health-logo.png" alt="j172tw Health" width={32} height={32} className="h-8 w-8" />
          j172tw Health
        </Link>

        <nav aria-label="主要導覽" className="hidden items-center gap-6 text-sm font-medium text-neutral-500 md:flex">
          <Link href="/" className="py-4 transition-colors hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            首頁
          </Link>
          <NavDropdown label="醫療院所" items={FACILITY_TOOLS} />
          <NavDropdown label="長照機構" items={LTC_TOOLS} />
          <NavDropdown label="食品營養" items={FOOD_TOOLS} />
          <NavDropdown label="健康工具" items={CALCULATOR_TOOLS} />
          {SOURCE_CATEGORIES.map((category) => (
            <NavDropdown key={category.key} label={category.label} items={category.sources.map((source) => ({ href: `/news?source=${encodeURIComponent(source.sourceName)}`, label: source.label }))} />
          ))}
          <a
            href="https://www.j172.tw"
            target="_blank"
            rel="noreferrer noopener"
            className="py-4 transition-colors hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            j172.tw
          </a>
        </nav>

        <button
          ref={toggleButtonRef}
          type="button"
          aria-expanded={mobileOpen}
          aria-controls={mobilePanelId}
          aria-label={mobileOpen ? "關閉選單" : "開啟選單"}
          onClick={() => setMobileOpen((value) => !value)}
          className="flex h-10 w-10 items-center justify-center text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" className="h-6 w-6">
            {mobileOpen ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />}
          </svg>
        </button>
      </div>

      {mobileOpen ? (
        <nav id={mobilePanelId} aria-label="行動裝置導覽" className="max-h-[75vh] overflow-y-auto border-t border-neutral-200 pb-4 md:hidden">
          <MobileGroup label="首頁" items={[{ href: "/", label: "首頁" }]} onNavigate={closeMobile} />
          <MobileGroup label="醫療院所" items={FACILITY_TOOLS} onNavigate={closeMobile} />
          <MobileGroup label="長照機構" items={LTC_TOOLS} onNavigate={closeMobile} />
          <MobileGroup label="食品營養" items={FOOD_TOOLS} onNavigate={closeMobile} />
          <MobileGroup label="健康工具" items={CALCULATOR_TOOLS} onNavigate={closeMobile} />
          {SOURCE_CATEGORIES.map((category) => (
            <MobileGroup
              key={category.key}
              label={category.label}
              items={category.sources.map((source) => ({ href: `/news?source=${encodeURIComponent(source.sourceName)}`, label: source.label }))}
              onNavigate={closeMobile}
            />
          ))}
          <div className="py-2">
            <a
              href="https://www.j172.tw"
              target="_blank"
              rel="noreferrer noopener"
              onClick={closeMobile}
              className="block rounded-md px-1 py-2 text-[15px] text-neutral-700 transition-colors hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              j172.tw ↗
            </a>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
