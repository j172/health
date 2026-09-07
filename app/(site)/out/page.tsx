import Link from "next/link";
import type { Metadata } from "next";
import { validateOutboundUrl } from "@/lib/format/outboundLink";
import { StabloFooter, StabloHeader } from "@/components/News/StabloNewsLayout";
import OutRedirectCountdown from "@/components/Common/OutRedirectCountdown";

export const metadata: Metadata = {
  title: "即將前往原網站 | health.j172.tw",
  robots: { index: false, follow: false },
};

/**
 * Outbound-redirect interstitial (issue #137).
 *
 * "前往官方原始網頁" links point here instead of straight at the external
 * article, so the destination site's analytics sees `health.j172.tw` as the
 * referrer instead of a bare/empty one, and so the actual navigation only
 * ever happens after the visitor has landed on a same-origin page — never as
 * a background tab spawned without a click, which was explicitly rejected as
 * a UX dark pattern (and browsers block unrequested popups anyway).
 *
 * The `url` query param is validated server-side before anything is rendered
 * (see `validateOutboundUrl`): only an absolute `https://` URL is accepted,
 * closing off this route as an open redirect. An invalid/missing `url`
 * renders an error state with no redirect of any kind.
 */
export default async function OutPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;
  const targetUrl = validateOutboundUrl(url);

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      {targetUrl ? (
        <meta httpEquiv="refresh" content={`3;url=${targetUrl}`} />
      ) : null}
      <StabloHeader />

      <main className="pb-20">
        <div className="mx-auto max-w-2xl px-4 pt-16 text-center sm:px-6 lg:px-8">
          {targetUrl ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                正在前往原網站…
              </p>
              <OutRedirectCountdown targetUrl={targetUrl} />
              <p className="mt-6 truncate text-xs text-slate-400 dark:text-slate-500">
                {targetUrl}
              </p>
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                無效的連結
              </p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                此轉址連結的網址參數無效或遺失，無法前往原網站。
              </p>
              <Link
                href="/news"
                className="mt-6 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
              >
                ← 返回所有健康新聞
              </Link>
            </div>
          )}
        </div>
      </main>

      <StabloFooter />
    </div>
  );
}
