"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "j172-health-privacy-notice-ack";

/**
 * Notice-and-acknowledge banner, not a granular cookie-consent gate — this
 * site sets no advertising/analytics cookies to gate in the first place (see
 * /privacy). Its job is the GDPR/CCPA-CPRA/APPI/CBPR/台灣個資法 baseline: tell
 * visitors what's processed (geolocation, if they grant it) before they hit
 * a feature that requests it, and link to the full policy.
 */
export default function PrivacyConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== "1") setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const acknowledge = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // localStorage unavailable (e.g. private mode) — banner will just reappear next visit.
    }
  };

  if (!visible) return null;

  return (
    <div role="region" aria-label="隱私權提示" className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white/95 px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-neutral-600 sm:text-sm">
          本站部分功能（如附近空氣品質／醫療院所查詢）會於您授權後使用瀏覽器定位資訊，僅用於即時查詢、不會儲存於伺服器；本站不使用廣告追蹤 Cookie。詳見{" "}
          <Link href="/privacy" className="text-primary underline hover:no-underline">
            隱私權政策
          </Link>
          （符合 GDPR、CCPA/CPRA、APPI、CBPR 與臺灣個資法之揭露規範）。
        </p>
        <button
          type="button"
          onClick={acknowledge}
          className="shrink-0 rounded-none bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primaryho"
        >
          我知道了
        </button>
      </div>
    </div>
  );
}
