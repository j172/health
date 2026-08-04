import Image from "next/image";
import { isValidAdminSecret } from "@/lib/server/config/adminAuth";
import { listSocialPostQueue } from "@/lib/server/social/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SocialQueueSearchParams = { key?: string };

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  posted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
  failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200",
};

const formatUtc = (value: Date): string => `${value.toISOString().replace("T", " ").slice(0, 19)} UTC`;

/**
 * Read-only admin review page for the social-post draft queue (spec section
 * 2.6). Gated by a `?key=` query param compared against
 * env.rssSyncAdminSecret — this is a page a human opens directly in a
 * browser rather than an API route called by curl/fetch, so it reuses the
 * same shared secret as /api/admin/* but checks it via query string instead
 * of the x-rss-sync-admin-secret header (see lib/server/config/adminAuth.ts).
 */
export default async function SocialQueuePage({ searchParams }: { searchParams: Promise<SocialQueueSearchParams> }) {
  const { key } = await searchParams;

  if (!isValidAdminSecret(key)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Unauthorized</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">A valid ?key= query parameter is required.</p>
      </main>
    );
  }

  const rows = await listSocialPostQueue(100);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">社群貼文草稿佇列</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Phase 1：僅供檢視，尚未串接 Meta Graph／Threads API，不會實際發布。
      </p>

      <div className="mt-6 space-y-4">
        {rows.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">目前沒有排入佇列的草稿。</p>}

        {rows.map((row) => (
          <article
            key={row.id}
            className="flex gap-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800"
          >
            <Image
              src={row.image_path}
              alt=""
              width={96}
              height={96}
              className="h-24 w-24 shrink-0 rounded-md object-cover"
              unoptimized
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">
                  {PLATFORM_LABELS[row.platform] ?? row.platform}
                </span>
                <span className={`rounded-full px-2 py-0.5 font-bold ${STATUS_STYLES[row.status] ?? STATUS_STYLES.draft}`}>
                  {row.status}
                </span>
                <span className="text-slate-400">{formatUtc(row.created_at)}</span>
              </div>
              <p className="mt-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{row.news_title}</p>
              <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-400">
                {row.caption}
              </p>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
