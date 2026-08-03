"use client";

import React, { useState, useEffect, useRef } from "react";
import { useLanguage } from "@/app/context/LanguageContext";
import ImmersiveReaderModal from "./ImmersiveReaderModal";

export interface ArticleReaderToolbarProps {
  title: string;
  authorLabel: string;
  publishDateStr: string;
  geoSummary?: string | null;
  articleHtml: string;
}

export default function ArticleReaderToolbar({
  title,
  authorLabel,
  publishDateStr,
  geoSummary,
  articleHtml,
}: ArticleReaderToolbarProps) {
  const { locale, t } = useLanguage();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rate, setRate] = useState<number>(1.0);
  const [isImmersiveOpen, setIsImmersiveOpen] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Extract clean text from HTML for speech synthesis
  const extractCleanText = (html: string): string => {
    if (typeof window === "undefined") return "";
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.textContent || "";
  };

  const getFullText = (): string => {
    const cleanBody = extractCleanText(articleHtml);
    const summaryText = geoSummary?.trim() ? `AI摘要：${geoSummary.trim()}。` : "";
    return `${title}。發布單位：${authorLabel}。發布時間：${publishDateStr}。${summaryText}${cleanBody}`;
  };

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis;
    } else {
      setIsSupported(false);
    }

    return () => {
      if (synthRef.current && synthRef.current.speaking) {
        synthRef.current.cancel();
      }
    };
  }, []);

  const selectBestVoice = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
    const targetLang = locale === "en" ? "en" : "zh-TW";

    // 1. Exact locale match
    let voice = voices.find((v) => v.lang.toLowerCase().replace("_", "-") === targetLang.toLowerCase());
    if (voice) return voice;

    // 2. Language prefix match (e.g. zh, en)
    const langPrefix = targetLang.split("-")[0].toLowerCase();
    voice = voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
    return voice || voices[0] || null;
  };

  const handlePlay = () => {
    if (!synthRef.current) return;

    if (isPaused) {
      synthRef.current.resume();
      setIsPlaying(true);
      setIsPaused(false);
      return;
    }

    synthRef.current.cancel(); // Stop any ongoing speech

    const textToRead = getFullText();
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utteranceRef.current = utterance;

    utterance.rate = rate;

    // Set voice according to locale
    const voices = synthRef.current.getVoices();
    const voice = selectBestVoice(voices);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utterance.onerror = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    synthRef.current.speak(utterance);
    setIsPlaying(true);
    setIsPaused(false);
  };

  const handlePause = () => {
    if (!synthRef.current) return;
    synthRef.current.pause();
    setIsPlaying(false);
    setIsPaused(true);
  };

  const handleStop = () => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    setIsPlaying(false);
    setIsPaused(false);
  };

  const handleRateChange = (newRate: number) => {
    setRate(newRate);
    if (isPlaying) {
      handleStop();
      setTimeout(() => handlePlay(), 100);
    }
  };

  return (
    <>
      <div className="my-6 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 dark:border-indigo-950 dark:bg-indigo-950/20 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: TTS Speech Controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 mr-1">
              <span>🔊</span>
              <span>{t("tts_title", "語音朗讀")}</span>
            </span>

            {isSupported ? (
              <>
                {!isPlaying ? (
                  <button
                    onClick={handlePlay}
                    className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition-colors cursor-pointer"
                  >
                    <span>▶</span>
                    <span>{isPaused ? t("tts_resume", "繼續") : t("tts_play", "朗讀文章")}</span>
                  </button>
                ) : (
                  <button
                    onClick={handlePause}
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-amber-600 transition-colors cursor-pointer"
                  >
                    <span>⏸</span>
                    <span>{t("tts_pause", "暫停")}</span>
                  </button>
                )}

                {(isPlaying || isPaused) && (
                  <button
                    onClick={handleStop}
                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    <span>⏹</span>
                    <span>{t("tts_stop", "停止")}</span>
                  </button>
                )}

                {/* Speed selector */}
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-400 font-medium hidden sm:inline">語速:</span>
                  <select
                    value={rate}
                    onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                  >
                    <option value={0.8}>0.8x</option>
                    <option value={1.0}>1.0x</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2.0}>2.0x</option>
                  </select>
                </div>
              </>
            ) : (
              <span className="text-xs text-slate-400">您的瀏覽器不支援語音合成</span>
            )}
          </div>

          {/* Right: Immersive Reader Button */}
          <div>
            <button
              onClick={() => setIsImmersiveOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-4 py-1.5 text-xs font-bold text-indigo-600 shadow-2xs hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-400 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer"
            >
              <span>📖</span>
              <span>{t("immersive_reader", "沉浸式閱讀模式")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Immersive Reader Modal Overlay */}
      {isImmersiveOpen && (
        <ImmersiveReaderModal
          title={title}
          authorLabel={authorLabel}
          publishDateStr={publishDateStr}
          geoSummary={geoSummary}
          articleHtml={articleHtml}
          isPlaying={isPlaying}
          isPaused={isPaused}
          onPlay={handlePlay}
          onPause={handlePause}
          onStop={handleStop}
          onClose={() => setIsImmersiveOpen(false)}
        />
      )}
    </>
  );
}
