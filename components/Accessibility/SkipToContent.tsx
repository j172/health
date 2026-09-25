"use client";

import Link from "next/link";
import { useContext } from "react";
import { LanguageContext } from "@/app/context/LanguageContext";

/**
 * SkipToContent Component
 * 
 * Complies with W3C WCAG 2.1 AA (2.4.1 Bypass Blocks) and Taiwan Ministry of Digital
 * Affairs (moda) accessibility standards.
 * 
 * Features:
 * - Visually hidden by default (sr-only), reveals smoothly on keyboard focus (focus-within:not-sr-only).
 * - Implements Taiwan required anchor points (:::) and standard AccessKeys:
 *   - Alt + C: Skip to main content (#main-content)
 *   - Alt + U: Skip to header navigation (#header-nav)
 *   - Alt + Z: Skip to footer copyright and links (#footer-info)
 * - Direct link to /accessibility statement page.
 */
export default function SkipToContent() {
  const langContext = useContext(LanguageContext);
  const t = langContext?.t ?? ((_key: string, fallback: string) => fallback);

  return (
    <div
      role="region"
      aria-label={t("a11y.skipRegion", "快速鍵與無障礙跳轉區塊")}
      className="sr-only focus-within:not-sr-only focus-within:fixed focus-within:top-3 focus-within:left-4 focus-within:z-[99999] focus-within:max-w-2xl focus-within:rounded-2xl focus-within:border-2 focus-within:border-indigo-500 focus-within:bg-slate-900/95 focus-within:p-3.5 focus-within:text-white focus-within:shadow-2xl focus-within:backdrop-blur-md dark:focus-within:bg-black/95 dark:focus-within:border-indigo-400"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-indigo-300" aria-hidden="true">
          ::: 無障礙快捷導航
        </span>
        <a
          href="#main-content"
          accessKey="C"
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-white"
        >
          {t("a11y.skipToMain", "跳至主要內容 (Alt+C)")}
        </a>
        <a
          href="#header-nav"
          accessKey="U"
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
        >
          {t("a11y.skipToNav", "上方主要導覽 (Alt+U)")}
        </a>
        <a
          href="#footer-info"
          accessKey="Z"
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
        >
          {t("a11y.skipToFooter", "下方資訊區 (Alt+Z)")}
        </a>
        <Link
          href="/accessibility"
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-indigo-300 underline underline-offset-2 transition hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
        >
          {t("a11y.statementLink", "無障礙宣告與快捷鍵說明")}
        </Link>
      </div>
    </div>
  );
}
