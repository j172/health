"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readRecentTools } from "@/lib/client/recentTools";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";
import { useLanguage } from "@/app/context/LanguageContext";
import { isPathLocale } from "@/lib/i18n/dictionary";
import { isTranslatedToolSlug, buildLocalizedPath } from "@/lib/i18n/translatedPages";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";

/**
 * Homepage's "最近使用的工具" section (issue #472, parent #438 §G acceptance
 * criterion 3: "使用過工具之後，首頁會顯示「最近使用的工具」"). Reads the
 * device-only localStorage list `components/Tools/RecentToolRecorder.tsx`
 * writes on every /tools/<slug> page visit — never sent to any server.
 *
 * "use client" + a mount effect (not server-rendered): the whole point is
 * per-device data that the server never sees, so this intentionally renders
 * nothing until after hydration, same as this repo's other localStorage-only
 * UI. Renders nothing at all (not even an empty-state message) before any
 * tool has ever been visited — an empty section here isn't an error state,
 * it just has nothing to show yet.
 */
export default function RecentToolsSection() {
  const { locale, t } = useLanguage();
  const [slugs, setSlugs] = useState<string[] | null>(null);

  useEffect(() => {
    // Deferred via queueMicrotask (see docs/archive/specs/set-state-in-effect-fix.md,
    // issue #121/#122, and lib/hooks/useSharedGeolocation.ts for the same
    // pattern): setState called synchronously in an effect body trips
    // react-hooks/set-state-in-effect. This only changes *when* the update
    // is scheduled relative to React's commit/paint cycle.
    queueMicrotask(() => {
      setSlugs(readRecentTools().map((entry) => entry.slug));
    });
  }, []);

  if (!slugs || slugs.length === 0) return null;

  const tools = slugs
    .map((slug) => TOOL_CATALOG.find((tool) => tool.slug === slug))
    .filter((tool): tool is NonNullable<typeof tool> => Boolean(tool));

  if (tools.length === 0) return null;

  // Issue #487: this reads back whatever the user has personally visited on
  // THEIR OWN device (localStorage, never sent to the server) — not page
  // content this ticket is translating. When a visited tool happens to have
  // a translated page (isTranslatedToolSlug), link/label switch to it; for
  // every other tool (the ~75 not yet translated by any ticket), the chip
  // keeps its real zh label and zh link — the same "a link into content
  // that isn't itself translated yet stays Chinese" rule the typhoon-
  // earthquake guide's own step links and ToolPageShell's "下一步" section
  // already use, not a fresh gap.
  const resolveTool = (tool: (typeof tools)[number]) => {
    if (isPathLocale(locale) && isTranslatedToolSlug(tool.slug)) {
      return {
        href: buildLocalizedPath(`/tools/${tool.slug}`, locale),
        label: getLocalizedToolMeta(tool.slug, locale).title,
      };
    }
    return { href: `/tools/${tool.slug}`, label: tool.navLabel ?? tool.title };
  };

  return (
    <section aria-label={t("homePage.recentTools.sectionAriaLabel", "最近使用的工具")} className="mb-8">
      <h2 className="mb-3 text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
        {t("homePage.recentTools.heading", "🕘 最近使用的工具")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {tools.map((tool) => {
          const { href, label } = resolveTool(tool);
          return (
            <Link
              key={tool.slug}
              href={href}
              className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-700 dark:hover:text-indigo-400"
            >
              {label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
