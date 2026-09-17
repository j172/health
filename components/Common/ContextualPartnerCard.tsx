"use client";

import React from "react";
import { useLanguage } from "@/app/context/LanguageContext";
import {
  CivicPartnerId,
  CONTEXTUAL_PARTNERS,
  buildContextualPartnerUrl,
} from "@/lib/constants/contextualPartners";

export type { CivicPartnerId, ContextualPartnerConfig } from "@/lib/constants/contextualPartners";
export { CONTEXTUAL_PARTNERS, buildContextualPartnerUrl } from "@/lib/constants/contextualPartners";

export interface ContextualPartnerCardProps {
  partnerId: CivicPartnerId;
  contextTitle?: string;
  contextDescription?: string;
  badgeText?: string;
  actionText?: string;
  targetSubpath?: string;
  className?: string;
  compact?: boolean;
}

export default function ContextualPartnerCard({
  partnerId,
  contextTitle,
  contextDescription,
  badgeText,
  actionText,
  targetSubpath,
  className = "",
  compact = false,
}: ContextualPartnerCardProps) {
  const { t } = useLanguage();
  const config = CONTEXTUAL_PARTNERS[partnerId];

  if (!config) return null;

  const title = contextTitle || config.defaultTitle;
  const description = contextDescription || config.defaultDescription;
  const badge = badgeText || config.badge;
  const action = actionText || config.defaultActionText;
  const targetUrl = buildContextualPartnerUrl(config.baseUrl, targetSubpath);

  if (compact) {
    return (
      <aside
        aria-label={`${config.name} - ${title}`}
        className={`group relative overflow-hidden rounded-2xl border bg-linear-to-r p-4 transition-all duration-200 hover:shadow-xs ${config.borderColor} ${config.hoverBorderColor} ${config.bgLinear} ${className}`}
      >
        <a
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl transition-transform duration-200 group-hover:scale-110 shrink-0">
                {config.icon}
              </span>
              <span
                className={`inline-block shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${config.badgeColor}`}
              >
                {badge}
              </span>
            </div>
            <span className="shrink-0 text-xs font-bold text-slate-700 transition-colors group-hover:text-indigo-600 dark:text-slate-300 dark:group-hover:text-indigo-400">
              {action} <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">↗</span>
            </span>
          </div>
          <h4 className="mt-2 text-xs font-bold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
            {title}
          </h4>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 line-clamp-2">
            {description}
          </p>
        </a>
      </aside>
    );
  }

  return (
    <aside
      aria-label={`${config.name} - ${title}`}
      className={`group relative mb-6 overflow-hidden rounded-2xl border bg-linear-to-r p-4 sm:p-5 shadow-2xs backdrop-blur-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${config.borderColor} ${config.hoverBorderColor} ${config.bgLinear} ${className}`}
    >
      <a
        href={targetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4"
      >
        <div className="flex items-start gap-3 min-w-0">
          <span className="mt-0.5 text-2xl sm:text-3xl transition-transform duration-200 group-hover:scale-110 shrink-0">
            {config.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-block rounded-full border px-2 py-0.5 text-[10px] sm:text-[11px] font-bold ${config.badgeColor}`}
              >
                {badge}
              </span>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                {config.name}
              </span>
            </div>
            <h3 className="mt-1 text-sm sm:text-base font-bold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
              {title}
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
              {description}
            </p>
          </div>
        </div>

        <div className="shrink-0 self-end sm:self-center">
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white/95 px-3.5 py-1.5 text-xs font-bold text-slate-800 shadow-2xs transition-all duration-200 group-hover:border-indigo-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-200 dark:group-hover:border-indigo-600 dark:group-hover:bg-indigo-950/60 dark:group-hover:text-indigo-300">
            <span>{action}</span>
            <span className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
              ↗
            </span>
          </span>
        </div>
      </a>
    </aside>
  );
}
