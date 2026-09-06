import React from "react";

export interface GooglePreferredSourceButtonProps {
  className?: string;
}

export default function GooglePreferredSourceButton({
  className = "",
}: GooglePreferredSourceButtonProps) {
  const tooltipText =
    "請點選打勾將 j172tw Healthz 設為首選來源，在 Google 上查看更多我們的精彩報導";
  const sourceUrl =
    "https://www.google.com/preferences/source?q=health.j172.tw";

  return (
    <a
      className={`group relative inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700 ${className}`}
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={tooltipText}
      data-tooltip={tooltipText}
      aria-label={tooltipText}
    >
      <svg
        className="h-4 w-4 shrink-0"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          fill="#FFC107"
          d="M22.296 9.944h-.846V9.9H12v4.2h5.934A6.297 6.297 0 0 1 5.7 12 6.3 6.3 0 0 1 12 5.7c1.606 0 3.067.606 4.18 1.595l2.97-2.97A10.45 10.45 0 0 0 12 1.5C6.202 1.5 1.5 6.201 1.5 12S6.202 22.5 12 22.5c5.799 0 10.5-4.701 10.5-10.5 0-.704-.072-1.391-.204-2.056"
        />
        <path
          fill="#FF3D00"
          d="m2.71 7.113 3.45 2.53A6.3 6.3 0 0 1 12 5.7c1.606 0 3.067.606 4.18 1.595l2.97-2.97A10.45 10.45 0 0 0 12 1.5c-4.033 0-7.53 2.277-9.29 5.613"
        />
        <path
          fill="#4CAF50"
          d="M12 22.5c2.712 0 5.176-1.038 7.04-2.726l-3.25-2.75A6.25 6.25 0 0 1 12 18.3a6.3 6.3 0 0 1-5.924-4.172l-3.424 2.639C4.39 20.167 7.92 22.5 12 22.5"
        />
        <path
          fill="#1976D2"
          d="M22.296 9.9H12v4.2h5.934a6.3 6.3 0 0 1-2.146 2.925l.002-.001 3.25 2.75c-.23.209 3.46-2.524 3.46-7.774 0-.704-.072-1.435-.204-2.1"
        />
      </svg>
      <span className="gsBtnText">加入Google首選</span>
    </a>
  );
}
