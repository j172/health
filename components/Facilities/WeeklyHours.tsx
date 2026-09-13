"use client";

import { useState, useEffect } from "react";

const DAYS = ["一", "二", "三", "四", "五", "六", "日"];
const PERIODS = ["上午", "下午", "晚上"];

/**
 * Validates whether a clinic weekly-hours note is displayable.
 * Rejects empty strings, plain hyphens, and strings corrupted by charset mismatches
 * (e.g. latin1 conversion turning Chinese characters into "????2?14-2?22???").
 */
export function isDisplayableNote(note?: string | null): boolean {
  if (!note) return false;
  const trimmed = note.trim();
  if (trimmed === "" || trimmed === "-") return false;
  // If there are 2 or more consecutive question marks, it's garbled mojibake
  if (/[\?？]{2,}/.test(trimmed)) return false;
  return true;
}

export default function WeeklyHoursLine({
  weeklyHours,
  note,
}: {
  weeklyHours?: Record<string, string[]> | null;
  note?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [todayDayName, setTodayDayName] = useState<string | null>(null);

  useEffect(() => {
    // Compute current day of week on client to avoid SSR hydration mismatch
    // JavaScript getDay(): 0 (Sun), 1 (Mon), ..., 6 (Sat)
    // Map to Monday=0 ... Sunday=6
    const jsDay = new Date().getDay();
    const dayIndex = (jsDay + 6) % 7;
    setTodayDayName(DAYS[dayIndex] ?? null);
  }, []);

  const hasValidNote = isDisplayableNote(note);
  const hasHours = Boolean(weeklyHours && Object.keys(weeklyHours).length > 0);
  if (!hasHours && !hasValidNote) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {hasHours && weeklyHours && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-neutral-500 dark:text-neutral-400">看診時段：</span>
          <div className="inline-flex items-center gap-1">
            {DAYS.map((day) => {
              const periods = weeklyHours[day] ?? [];
              const open = periods.length > 0;
              const isToday = day === todayDayName;
              return (
                <span
                  key={day}
                  title={open ? `${day}：${periods.join("、")}` : `${day}：休診`}
                  className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold transition-colors ${
                    open
                      ? isToday
                        ? "bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-500 font-bold dark:bg-emerald-500 dark:text-neutral-900"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : isToday
                        ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 ring-1 ring-slate-400"
                        : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                  }`}
                >
                  {day}
                </span>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-label={expanded ? "收合早中晚時段明細" : "展開早中晚時段明細"}
            className="ml-1 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 active:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-300 transition-colors cursor-pointer"
          >
            <span>{expanded ? "收合" : "早中晚"}</span>
            <svg
              className={`h-3 w-3 transform transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}

      {/* 7×3 早中晚時段展開表 */}
      {expanded && hasHours && weeklyHours && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50/70 p-2 text-xs dark:border-neutral-800 dark:bg-neutral-900/60">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">每週早中晚門診表</span>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
                <span>開診</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="text-neutral-300 dark:text-neutral-600">—</span>
                <span>休診</span>
              </span>
            </div>
          </div>
          <table className="w-full text-center text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-500 dark:text-neutral-400">
                <th className="py-1 px-1 text-left font-normal">時段</th>
                {DAYS.map((day) => {
                  const isToday = day === todayDayName;
                  return (
                    <th
                      key={day}
                      className={`py-1 px-1 font-semibold rounded-t ${
                        isToday
                          ? "bg-emerald-100/70 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : ""
                      }`}
                    >
                      {day}
                      {isToday && (
                        <span className="block text-[9px] font-normal leading-none text-emerald-600 dark:text-emerald-400">
                          今日
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/60 dark:divide-neutral-800/60 text-[11px]">
              {PERIODS.map((period) => (
                <tr key={period}>
                  <td className="py-1.5 px-1 text-left font-medium text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                    {period}
                  </td>
                  {DAYS.map((day) => {
                    const periods = weeklyHours[day] ?? [];
                    const isOpen = periods.includes(period);
                    const isToday = day === todayDayName;
                    return (
                      <td
                        key={day}
                        className={`py-1.5 px-1 ${
                          isToday ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""
                        }`}
                      >
                        {isOpen ? (
                          <span
                            title={`${day}${period}：開診`}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 font-bold text-[10px]"
                          >
                            ●
                          </span>
                        ) : (
                          <span
                            title={`${day}${period}：休診`}
                            className="inline-block text-neutral-300 dark:text-neutral-600"
                          >
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasValidNote && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          📝 備註：{note!.trim()}
        </p>
      )}
    </div>
  );
}
