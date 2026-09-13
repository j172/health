"use client";

import { useState, type ReactNode } from "react";

export interface ToolTypeTab {
  key: string;
  label: string;
  icon?: string;
  content: ReactNode;
}

/**
 * Shared "type filter" tab switcher for merged tool pages (issue #256): each
 * of the 5 merges keeps every original tool's content and component intact,
 * just switched behind a tab instead of living on its own page/route. Only
 * the active tab's content is mounted — the others stay unrendered, so a
 * tab's own data-fetching effect doesn't run until it's actually selected.
 */
export default function ToolTypeTabs({
  tabs,
  initialKey,
  ariaLabel,
}: {
  tabs: ToolTypeTab[];
  initialKey?: string;
  ariaLabel: string;
}) {
  const [active, setActive] = useState(initialKey ?? tabs[0]?.key);

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex flex-wrap gap-2"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
              active === tab.key
                ? "bg-indigo-600 text-white shadow-xs dark:bg-indigo-500"
                : "border border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-700"
            }`}
          >
            {tab.icon ? <span>{tab.icon}</span> : null}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {tabs.map((tab) =>
        active === tab.key ? (
          <div key={tab.key} role="tabpanel">
            {tab.content}
          </div>
        ) : null,
      )}
    </div>
  );
}
