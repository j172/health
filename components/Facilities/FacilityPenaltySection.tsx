"use client";

import React, { useState } from "react";
import type { FacilityPenaltyInfo } from "@/lib/server/facilities/sources/nhiPenalties";

export function FacilityPenaltyBadge({ penalty }: { penalty?: FacilityPenaltyInfo | null }) {
  if (!penalty) return null;

  if (penalty.status === "suspended_execution") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 shadow-sm dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-300">
        <span>⚠️</span>
        <span>處分暫緩執行中</span>
      </span>
    );
  }

  if (penalty.status === "expired") {
    const endStr = penalty.endDate ? penalty.endDate.replace(/-/g, "/") : "";
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-400">
        <span>ℹ️</span>
        <span>歷史處分（已期滿{endStr ? ` ${endStr}` : ""}）</span>
      </span>
    );
  }

  // Active penalty
  let label = "健保處分中";
  if (penalty.category && penalty.category.includes("終止特約")) {
    label = "處分中（終止特約）";
  } else if (penalty.endDate) {
    label = `處分中（至 ${penalty.endDate.replace(/-/g, "/")}）`;
  } else if (penalty.category) {
    label = `處分中（${penalty.category}）`;
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 shadow-sm dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
      <span>🛑</span>
      <span>{label}</span>
    </span>
  );
}

export function FacilityPenaltyAccordion({ penalty }: { penalty?: FacilityPenaltyInfo | null }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!penalty) return null;

  return (
    <div className="mt-2.5 pt-2 border-t border-dashed border-neutral-200 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 transition-colors focus:outline-none"
      >
        <span>{isOpen ? "🔺" : "🔻"}</span>
        <span className="underline underline-offset-2">
          {isOpen ? "收合健保處分詳情" : "查看健保處分與違規詳情"}
        </span>
      </button>

      {isOpen && (
        <div className="mt-2 rounded-lg bg-rose-50/60 p-3 text-xs border border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/40 text-neutral-700 dark:text-slate-300 space-y-1.5 transition-all">
          <div className="flex flex-wrap items-center gap-2 font-medium">
            <span className="text-neutral-500 dark:text-slate-400">處分類別：</span>
            <span className="text-rose-700 dark:text-rose-300 font-semibold">{penalty.category}</span>
          </div>

          {penalty.practitioner && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-neutral-500 dark:text-slate-400">受處分人員／負責醫事人員：</span>
              <span className="font-semibold text-neutral-800 dark:text-slate-200">{penalty.practitioner}</span>
            </div>
          )}

          {(penalty.startDate || penalty.endDate || penalty.rawMinguoRange) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-neutral-500 dark:text-slate-400">處分／管制期間：</span>
              <span>
                {penalty.startDate ? penalty.startDate.replace(/-/g, "/") : "—"} ～{" "}
                {penalty.endDate ? penalty.endDate.replace(/-/g, "/") : "—"}
                {penalty.rawMinguoRange && (
                  <span className="ml-1 text-neutral-400 dark:text-slate-500">
                    （民國 {penalty.rawMinguoRange}）
                  </span>
                )}
              </span>
            </div>
          )}

          {penalty.reason && (
            <div className="mt-1">
              <span className="text-neutral-500 dark:text-slate-400 block mb-0.5 font-medium">處分原由：</span>
              <p className="rounded bg-white/80 dark:bg-slate-900/60 p-2 leading-relaxed border border-rose-100/60 dark:border-rose-900/30 text-neutral-800 dark:text-slate-200">
                {penalty.reason}
              </p>
            </div>
          )}

          {penalty.clauses && (
            <div className="mt-1 text-[11px] text-neutral-500 dark:text-slate-400">
              <span>引用法規條款：{penalty.clauses}</span>
            </div>
          )}

          <div className="pt-1 text-[10px] text-neutral-400 dark:text-slate-500">
            資料來源：衛生福利部中央健康保險署官方公告【{penalty.sourceTitle}】
          </div>
        </div>
      )}
    </div>
  );
}
