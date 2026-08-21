"use client";

import React, { useState } from "react";
import { useModalA11y } from "@/components/ui/useModalA11y";
import { useLanguage } from "@/app/context/LanguageContext";

export interface ImmersiveReaderModalProps {
  title: string;
  authorLabel: string;
  publishDateStr: string;
  geoSummary?: string | null;
  articleHtml: string;
  isPlaying: boolean;
  isPaused: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onClose: () => void;
}

export default function ImmersiveReaderModal({
  title,
  authorLabel,
  publishDateStr,
  geoSummary,
  articleHtml,
  isPlaying,
  isPaused,
  onPlay,
  onPause,
  onStop,
  onClose,
}: ImmersiveReaderModalProps) {
  const { t } = useLanguage();
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg" | "xl">("lg");
  // SPECIFICATION.md 7.4 asks for line spacing as its own control. It used to be
  // welded to fontSize, so a reader could not have large text at tight spacing.
  const [lineSpacing, setLineSpacing] = useState<"tight" | "normal" | "loose">(
    "normal",
  );
  const [theme, setTheme] = useState<"light" | "sepia" | "dark">("sepia");

  const dialogRef = useModalA11y({ isOpen: true, onClose });

  const themeClasses = {
    light: "bg-white text-slate-900 border-slate-200",
    sepia: "bg-[#fbf0d9] text-[#433422] border-[#e8d7be]",
    dark: "bg-slate-950 text-slate-100 border-slate-800",
  };

  /**
   * Chrome tints derived from the reader's OWN palette.
   *
   * These were previously Tailwind `dark:` utilities, which follow the global
   * next-themes class — so choosing "pure white" while the site was in dark mode
   * produced a white page wearing dark-mode controls.
   */
  const chromeClasses = {
    light: {
      surface: "bg-black/5",
      hover: "hover:bg-black/5",
      accent: "text-indigo-600",
    },
    sepia: {
      surface: "bg-black/5",
      hover: "hover:bg-black/5",
      accent: "text-amber-800",
    },
    dark: {
      surface: "bg-white/10",
      hover: "hover:bg-white/10",
      accent: "text-indigo-400",
    },
  };
  const chrome = chromeClasses[theme];

  const fontSizeClasses = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-xl",
    xl: "text-2xl",
  };

  const lineSpacingClasses = {
    tight: "leading-snug",
    normal: "leading-relaxed",
    loose: "leading-loose",
  };

  const containerWidthClasses = {
    sm: "max-w-2xl",
    md: "max-w-3xl",
    lg: "max-w-4xl",
    xl: "max-w-5xl",
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("reader.dialogLabel", "沉浸閱讀模式")}
      className={`fixed inset-0 z-50 overflow-y-auto ${themeClasses[theme]} transition-colors duration-200`}
    >
      {/* Top Floating Control Bar */}
      <header className="sticky top-0 z-10 border-b border-inherit bg-inherit/90 px-4 py-3 backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          {/* Left: Reading controls (Font Size, Theme) */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Theme selector */}
            <div
              className={`flex items-center gap-1 rounded-full border border-inherit p-1 ${chrome.surface}`}
              role="group"
              aria-label={t("reader.themeLight", "純白主題")}
            >
              <button
                onClick={() => setTheme("light")}
                className={`h-6 w-6 rounded-full border bg-white shadow-xs transition-transform ${theme === "light" ? "scale-110 ring-2 ring-indigo-500" : ""}`}
                aria-label={t("reader.themeLight", "純白主題")}
                aria-pressed={theme === "light"}
              />
              <button
                onClick={() => setTheme("sepia")}
                className={`h-6 w-6 rounded-full border border-[#e8d7be] bg-[#fbf0d9] shadow-xs transition-transform ${theme === "sepia" ? "scale-110 ring-2 ring-amber-600" : ""}`}
                aria-label={t("reader.themeSepia", "米色護眼")}
                aria-pressed={theme === "sepia"}
              />
              <button
                onClick={() => setTheme("dark")}
                className={`h-6 w-6 rounded-full border border-slate-700 bg-slate-900 shadow-xs transition-transform ${theme === "dark" ? "scale-110 ring-2 ring-indigo-400" : ""}`}
                aria-label={t("reader.themeDark", "深色主題")}
                aria-pressed={theme === "dark"}
              />
            </div>

            {/* Font Size Selector */}
            <div
              className={`flex items-center rounded-lg border border-inherit p-0.5 text-xs font-bold ${chrome.surface}`}
              role="group"
              aria-label={t("reader.fontSize", "字級")}
            >
              <button
                onClick={() => setFontSize("sm")}
                className={`rounded-md px-2.5 py-1 transition-colors ${fontSize === "sm" ? "bg-indigo-600 text-white" : ""}`}
              >
                A-
              </button>
              <button
                onClick={() => setFontSize("md")}
                className={`rounded-md px-2.5 py-1 transition-colors ${fontSize === "md" ? "bg-indigo-600 text-white" : ""}`}
              >
                A
              </button>
              <button
                onClick={() => setFontSize("lg")}
                className={`rounded-md px-2.5 py-1 transition-colors ${fontSize === "lg" ? "bg-indigo-600 text-white" : ""}`}
              >
                A+
              </button>
              <button
                onClick={() => setFontSize("xl")}
                className={`rounded-md px-2.5 py-1 transition-colors ${fontSize === "xl" ? "bg-indigo-600 text-white" : ""}`}
              >
                A++
              </button>
            </div>

            {/* Line spacing — SPECIFICATION.md 7.4 requires this independently of font size */}
            <div
              className={`flex items-center rounded-lg border border-inherit p-0.5 text-xs font-bold ${chrome.surface}`}
              role="group"
              aria-label={t("reader.lineSpacing", "行距")}
            >
              {(["tight", "normal", "loose"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setLineSpacing(value)}
                  aria-pressed={lineSpacing === value}
                  className={`rounded-md px-2.5 py-1 transition-colors ${lineSpacing === value ? "bg-indigo-600 text-white" : ""}`}
                >
                  {t(
                    `reader.line${value.charAt(0).toUpperCase()}${value.slice(1)}`,
                    value,
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Center: TTS Controls in Immersive Mode */}
          <div className="flex items-center gap-2">
            {!isPlaying ? (
              <button
                onClick={onPlay}
                className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-1 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700"
              >
                ▶{" "}
                {isPaused ? t("tts_resume", "繼續") : t("tts_play", "朗讀文章")}
              </button>
            ) : (
              <button
                onClick={onPause}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3.5 py-1 text-xs font-bold text-white shadow-xs transition-colors hover:bg-amber-600"
              >
                ⏸ {t("tts_pause", "暫停")}
              </button>
            )}

            {(isPlaying || isPaused) && (
              <button
                onClick={onStop}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-300 px-3.5 py-1 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-400"
              >
                ⏹ {t("tts_stop", "停止")}
              </button>
            )}
          </div>

          {/* Right: Exit Immersive Reader */}
          <button
            onClick={onClose}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-inherit px-4 py-1.5 text-xs font-bold transition-colors ${chrome.hover}`}
          >
            <span>✕</span>
            <span>{t("reader.close", "離開沉浸模式")}</span>
          </button>
        </div>
      </header>

      {/* Article Content Container */}
      <main className={`mx-auto px-6 py-12 ${containerWidthClasses[fontSize]}`}>
        {/* Header */}
        <header className="mb-10 border-b border-inherit pb-8 text-center">
          <h1 className="text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 text-sm font-medium opacity-75">
            <span>{authorLabel}</span>
            <span>•</span>
            <time>{publishDateStr}</time>
          </div>
        </header>

        {/* AI GEO Summary Box */}
        {geoSummary?.trim() ? (
          <div
            className={`mb-10 rounded-2xl border border-inherit p-6 shadow-xs ${chrome.surface}`}
          >
            <p
              className={`mb-2 text-xs font-bold tracking-wider uppercase ${chrome.accent}`}
            >
              💡 {t("reader.summary", "核心摘要")}
            </p>
            <p className="text-base leading-relaxed opacity-90">
              {geoSummary.trim()}
            </p>
          </div>
        ) : null}

        {/* Main Body */}
        <div
          className={`news-article ${fontSizeClasses[fontSize]} ${lineSpacingClasses[lineSpacing]}`}
          dangerouslySetInnerHTML={{ __html: articleHtml }}
        />

        {/* Bottom Exit CTA */}
        <div className="mt-16 border-t border-inherit pt-8 text-center">
          <button
            onClick={onClose}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-indigo-700"
          >
            ✓ 完成閱讀（返回標準頁面）
          </button>
        </div>
      </main>
    </div>
  );
}
