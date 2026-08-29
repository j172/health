"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "j172-health-privacy-notice-ack";

const subscribeToStorage = (callback: () => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

const getAckSnapshot = (): boolean => {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export default function PrivacyConsentBanner() {
  const [dismissed, setDismissed] = useState(false);
  const isAcked = useSyncExternalStore(subscribeToStorage, getAckSnapshot, () => true);

  const handleConsent = (grantAnalytics: boolean) => {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
      window.localStorage.setItem("j172-consent-analytics", grantAnalytics ? "granted" : "denied");
    } catch {
      // localStorage unavailable (e.g. private mode)
    }

    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        analytics_storage: grantAnalytics ? "granted" : "denied",
      });
    }
  };

  if (isAcked || dismissed) return null;

  return (
    <div role="region" aria-label="隱私權與 Cookie 同意提示" className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white/95 px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-300 sm:text-sm">
          本站使用必要 Cookie 與 Google Analytics 分析網站流量以改善服務體驗。地理定位僅於您授權後即時查詢，不儲存於伺服器。詳見{" "}
          <Link href="/privacy" className="text-primary underline hover:no-underline dark:text-primary">
            隱私權政策與同意聲明
          </Link>
          （符合 GDPR、CCPA/CPRA 與臺灣個資法）。
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => handleConsent(false)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 sm:text-sm"
          >
            僅必要功能
          </button>
          <button
            type="button"
            onClick={() => handleConsent(true)}
            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primaryho sm:text-sm"
          >
            同意並接受
          </button>
        </div>
      </div>
    </div>
  );
}
