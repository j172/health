import Link from "next/link";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";

export default function GroupTabs({ activeGroupKey }: { activeGroupKey?: string }) {
  return (
    <nav className="mb-8 flex flex-wrap items-center gap-2" aria-label="來源分類">
      <Link
        href="/news"
        className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
          !activeGroupKey
            ? "bg-indigo-600 text-white dark:bg-indigo-500 shadow-sm"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        }`}
      >
        全部新聞
      </Link>
      {SOURCE_CATEGORIES.map((cat) => (
        <Link
          key={cat.key}
          href={`/news?group=${cat.key}`}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
            activeGroupKey === cat.key
              ? "bg-indigo-600 text-white dark:bg-indigo-500 shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          {cat.label}
        </Link>
      ))}
    </nav>
  );
}
