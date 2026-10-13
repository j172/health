"use client";

import { useState } from "react";
import { useLanguage } from "@/app/context/LanguageContext";

/**
 * Issue #485: on the 3 pilot translated tool pages, government data
 * (institution names, addresses) stays in Chinese verbatim — this button
 * is the UI-chrome affordance the issue asks for alongside that untranslated
 * text: a "Copy address" button whose own label is localized even though
 * the address string it copies is not. Shared by AedContent.tsx and
 * EmergencyRoomContent.tsx so the copy/feedback behaviour can't drift
 * between the two.
 */
export default function CopyAddressButton({
  address,
  className = "",
}: {
  address: string;
  className?: string;
}) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Clipboard API can throw in insecure contexts / permission-denied —
      // silently ignore, same as EmergencyHotlinesContent's existing copy
      // button does for phone numbers.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={
        className ||
        "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      }
    >
      <span aria-hidden="true">📋</span>
      <span>{copied ? t("toolShell.addressCopied", "已複製") : t("toolShell.copyAddress", "複製地址")}</span>
    </button>
  );
}
