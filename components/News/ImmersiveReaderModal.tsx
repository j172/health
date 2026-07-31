"use client";

import React, { useState } from "react";

export interface ImmersiveReaderModalProps {
  title: string;
  authorLabel: string;
  publishDateStr: string;
  geoSummary?: string | null;
  articleHtml: string;
  isPlaying: boolean;
  isPaused: boolean;
  rate: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRateChange: (rate: number) => void;
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
  rate,
  onPlay,
  onPause,
  onStop,
  onRateChange,
  onClose,
}: ImmersiveReaderModalProps) {
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg" | "xl">("lg");
  const [theme, setTheme] = useState<"light" | "sepia" | "dark">("sepia");
  const [lineHeight, setLineHeight] = useState<"normal" | "relaxed" | "loose">("relaxed");

  const themeClasses = {
    light: "bg-white text-slate-900 border-slate-200",
    sepia: "bg-[#fbf0d9] text-[#433422] border-[#e8d7be]",
    dark: "bg-slate-950 text-slate-100 border-slate-800",
  };

  const fontSizeClasses = {
    sm: "text-base leading-relaxed",
    md: "text-lg leading-relaxed",
    lg: "text-xl leading-loose",
    xl: "text-2xl leading-loose",
  };

  const containerWidthClasses = {
    sm: "max-w-2xl",
    md: "max-w-3xl",
    lg: "max-w-4xl",
    xl: "max-w-5xl",
  };

  return (
    <div className={`fixed inset-0 z-50 overflow-y-auto ${themeClasses[theme]} transition-colors duration-200`}>
      {/* Top Floating Control Bar */}
      <header className="sticky top-0 z-10 border-b border-inherit bg-inherit/90 px-4 py-3 backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          {/* Left: Reading controls (Font Size, Theme) */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Theme selector */}
            <div className="flex items-center gap-1 rounded-full border border-inherit bg-black/5 p-1 dark:bg-white/10">
              <button
                onClick={() => setTheme("light")}
                className={`h-6 w-6 rounded-full bg-white shadow-xs border transition-transform ${theme === "light" ? "ring-2 ring-indigo-500 scale-110" : ""}`}
                title="純白主題"
              />
              <button
                onClick={() => setTheme("sepia")}
                className={`h-6 w-6 rounded-full bg-[#fbf0d9] shadow-xs border border-[#e8d7be] transition-transform ${theme === "sepia" ? "ring-2 ring-amber-600 scale-110" : ""}`}
                title="羊皮紙暖光"
              />
              <button
                onClick={() => setTheme("dark")}
                className={`h-6 w-6 rounded-full bg-slate-900 shadow-xs border border-slate-700 transition-transform ${theme === "dark" ? "ring-2 ring-indigo-400 scale-110" : ""}`}
                title="極深夜模式"
              />
            </div>

            {/* Font Size Selector */}
            <div className="flex items-center rounded-lg border border-inherit bg-black/5 p-0.5 dark:bg-white/10 text-xs font-bold">
              <button
                onClick={() => setFontSize("sm")}
                className={`px-2.5 py-1 rounded-md transition-colors ${fontSize === "sm" ? "bg-indigo-600 text-white" : ""}`}
              >
                A-
              </button>
              <button
                onClick={() => setFontSize("md")}
                className={`px-2.5 py-1 rounded-md transition-colors ${fontSize === "md" ? "bg-indigo-600 text-white" : ""}`}
              >
                A
              </button>
              <button
                onClick={() => setFontSize("lg")}
                className={`px-2.5 py-1 rounded-md transition-colors ${fontSize === "lg" ? "bg-indigo-600 text-white" : ""}`}
              >
                A+
              </button>
              <button
                onClick={() => setFontSize("xl")}
                className={`px-2.5 py-1 rounded-md transition-colors ${fontSize === "xl" ? "bg-indigo-600 text-white" : ""}`}
              >
                A++
              </button>
            </div>
          </div>

          {/* Center: TTS Controls in Immersive Mode */}
          <div className="flex items-center gap-2">
            {!isPlaying ? (
              <button
                onClick={onPlay}
                className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition-colors"
              >
                ▶ {isPaused ? "繼續" : "語音朗讀"}
              </button>
            ) : (
              <button
                onClick={onPause}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-amber-600 transition-colors"
              >
                ⏸ 暫停
              </button>
            )}

            {(isPlaying || isPaused) && (
              <button
                onClick={onStop}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-300 px-3.5 py-1 text-xs font-bold text-slate-800 hover:bg-slate-400 transition-colors"
              >
                ⏹ 停止
              </button>
            )}
          </div>

          {/* Right: Exit Immersive Reader */}
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full border border-inherit px-4 py-1.5 text-xs font-bold hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <span>✕</span>
            <span>離開沉浸模式</span>
          </button>
        </div>
      </header>

      {/* Article Content Container */}
      <main className={`mx-auto px-6 py-12 ${containerWidthClasses[fontSize]}`}>
        {/* Header */}
        <header className="mb-10 text-center border-b border-inherit pb-8">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 text-sm opacity-75 font-medium">
            <span>{authorLabel}</span>
            <span>•</span>
            <time>{publishDateStr}</time>
          </div>
        </header>

        {/* AI GEO Summary Box */}
        {geoSummary?.trim() ? (
          <div className="mb-10 rounded-2xl border border-inherit bg-black/5 p-6 dark:bg-white/5 shadow-xs">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-2">
              💡 核心摘要
            </p>
            <p className="text-base leading-relaxed opacity-90">{geoSummary.trim()}</p>
          </div>
        ) : null}

        {/* Main Body */}
        <div
          className={`news-article ${fontSizeClasses[fontSize]}`}
          dangerouslySetInnerHTML={{ __html: articleHtml }}
        />

        {/* Bottom Exit CTA */}
        <div className="mt-16 text-center border-t border-inherit pt-8">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            ✓ 完成閱讀（返回標準頁面）
          </button>
        </div>
      </main>
    </div>
  );
}
