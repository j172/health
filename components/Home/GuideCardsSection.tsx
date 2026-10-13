import Link from "next/link";
import { GUIDES } from "@/lib/server/tools/navModel";

/**
 * Homepage's 5 life-situation cards (issue #472, parent #438 §G acceptance
 * criterion 2: "首頁能看到 5 張生活情境卡，點擊可以進入對應情境頁"). Pure
 * server component — `GUIDES` (issue #443/#465) is static data, no DB
 * access, so this needs no client-side fetching at all; it renders straight
 * from the same source of truth `/guides` and `/guides/[slug]` already use,
 * and can never drift from them.
 *
 * Per this project's standing content rule, every `Guide.title`/`description`
 * already uses plain "使用者" throughout (see navModel.ts) and avoids any
 * persona-label copy, so this component only needs to render that copy
 * verbatim, not rewrite it.
 */
const GUIDE_EMOJI: Record<string, string> = {
  "caring-for-elders": "🧓",
  "pregnancy-to-parenting": "🤰",
  "typhoon-earthquake": "🌀",
  "disability-living": "♿",
  "travel-health": "✈️",
};

export default function GuideCardsSection() {
  return (
    <section aria-label="生活情境指南" className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">🧭 依生活情境找工具</h2>
        <Link href="/guides" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">
          查看全部情境 →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {GUIDES.map((guide) => (
          <Link
            key={guide.slug}
            href={`/guides/${guide.slug}`}
            className="group flex flex-col items-start gap-1.5 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
          >
            <span aria-hidden="true" className="text-2xl">{GUIDE_EMOJI[guide.slug] ?? "🧭"}</span>
            <h3 className="text-sm font-bold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
              {guide.title}
            </h3>
            <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
              {guide.description}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
