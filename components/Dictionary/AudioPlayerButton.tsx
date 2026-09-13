"use client";

import { useState, useRef, useEffect } from "react";

interface AudioPlayerButtonProps {
  lang: "twblg" | "hakka";
  audioId?: string | null;
  variant?: number; // 1: 四縣, 2: 海陸, 3: 大埔, 4: 饒平, 5: 詔安, 6: 南四縣
  size?: "sm" | "md" | "lg";
  label?: string;
}

const CDN_BASE = "https://r2-assets.moedict.tw";

function buildAudioUrls(lang: "twblg" | "hakka", audioId: string, variant: number = 1): string[] {
  const cleanId = String(audioId || "").trim();
  if (!cleanId) return [];

  if (lang === "twblg") {
    // 5 digits padded for twblg
    const padded = /^\d{1,4}$/.test(cleanId) ? cleanId.padStart(5, "0") : cleanId;
    return [
      `${CDN_BASE}/audio/t/${padded}.mp3`,
      `${CDN_BASE}/audio/t/${padded}.ogg`,
      `https://twblg.dict.edu.tw/holodict_new/audio/${padded}.mp3`,
    ];
  } else {
    // Hakka uses {variant}-{audioId}
    const cleanAudioId = /^\d{1,4}$/.test(cleanId) ? cleanId.padStart(5, "0") : cleanId;
    return [
      `${CDN_BASE}/audio/h/${variant}-${cleanAudioId}.mp3`,
      `${CDN_BASE}/audio/h/${variant}-${cleanAudioId}.ogg`,
      `${CDN_BASE}/audio/h/1-${cleanAudioId}.mp3`,
    ];
  }
}

export default function AudioPlayerButton({
  lang,
  audioId,
  variant = 1,
  size = "md",
  label,
}: AudioPlayerButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  if (!audioId) return null;

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }

    const candidateUrls = buildAudioUrls(lang, audioId, variant);
    if (candidateUrls.length === 0) return;

    setIsLoading(true);
    setHasError(false);

    let played = false;
    for (const url of candidateUrls) {
      try {
        const audio = new Audio();
        audio.preload = "auto";
        audioRef.current = audio;

        await new Promise<void>((resolve, reject) => {
          const onCanPlay = () => {
            audio.removeEventListener("canplaythrough", onCanPlay);
            audio.removeEventListener("error", onError);
            resolve();
          };
          const onError = () => {
            audio.removeEventListener("canplaythrough", onCanPlay);
            audio.removeEventListener("error", onError);
            reject(new Error("Playback error"));
          };
          audio.addEventListener("canplaythrough", onCanPlay);
          audio.addEventListener("error", onError);
          audio.src = url;
          audio.load();
        });

        audio.onended = () => {
          setIsPlaying(false);
        };
        audio.onerror = () => {
          setIsPlaying(false);
        };

        await audio.play();
        setIsLoading(false);
        setIsPlaying(true);
        played = true;
        break;
      } catch (err) {
        // Try next format candidate
        continue;
      }
    }

    setIsLoading(false);
    if (!played) {
      setHasError(true);
      setTimeout(() => setHasError(false), 2500);
    }
  };

  const sizeClasses = {
    sm: "h-7 w-7 text-xs",
    md: "h-9 w-9 text-sm",
    lg: "h-11 w-11 text-base",
  }[size];

  return (
    <button
      type="button"
      onClick={handlePlay}
      disabled={isLoading}
      title={hasError ? "音檔暫時無法播放" : isPlaying ? "停止播放" : `播放${lang === "hakka" ? "客語" : "閩南語"}發音`}
      aria-label={isPlaying ? "停止朗讀" : "聆聽發音"}
      className={`relative inline-flex items-center justify-center rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 ${
        hasError
          ? "bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
          : isPlaying
          ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20 scale-105"
          : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:scale-105 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
      } ${sizeClasses}`}
    >
      {isLoading ? (
        <svg
          className="animate-spin h-4 w-4 text-indigo-600 dark:text-indigo-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
      ) : isPlaying ? (
        // Stop icon with pulse wave
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-4 w-4"
        >
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        // Speaker with sound wave icon
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.5A2.25 2.25 0 002.25 9.75v4.5a2.25 2.25 0 002.25 2.25h1.94l4.5 4.5c.944.945 2.56.276 2.56-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
          <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
        </svg>
      )}
      {label && <span className="ml-1 text-xs font-semibold">{label}</span>}
    </button>
  );
}
