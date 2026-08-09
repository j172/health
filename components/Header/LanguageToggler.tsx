"use client";

import { useState, useRef, useEffect } from "react";
import { useLanguage, Locale } from "@/app/context/LanguageContext";

const languages: { code: Locale; label: string; flag: string }[] = [
  { code: "zh-TW", label: "正體中文", flag: "🇹🇼" },
  { code: "en", label: "English", flag: "🇺🇸" },
];

export default function LanguageToggler() {
  const { locale, setLocale } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = languages.find((l) => l.code === locale) || languages[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="btn-press flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        aria-label="Switch Language"
      >
        <span className="text-sm">🌐</span>
        <span>{currentLang.label}</span>
        <svg
          className={`h-3 w-3 transition-transform duration-200 ease-out ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-36 origin-top-right rounded-xl border border-slate-200/80 bg-white/95 backdrop-blur-md py-1.5 shadow-xl ring-1 ring-black/5 dark:border-slate-800/80 dark:bg-slate-900/95 z-50 animate-in fade-in zoom-in-95 duration-200 ease-out">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setLocale(lang.code);
                setIsOpen(false);
              }}
              className={`btn-press flex w-full items-center justify-between px-3.5 py-2 text-xs font-medium ${
                locale === lang.code
                  ? "bg-indigo-50 font-bold text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              <span className="flex items-center gap-2">
                <span>{lang.flag}</span>
                <span>{lang.label}</span>
              </span>
              {locale === lang.code && (
                <svg className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
