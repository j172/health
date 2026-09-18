import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { validateOutboundUrl, appendOutboundUtm } from "@/lib/format/outboundLink";
import { StabloFooter, StabloHeader } from "@/components/News/StabloNewsLayout";

export const metadata: Metadata = {
  title: "即將前往原網站 | health.j172.tw",
  robots: { index: false, follow: false },
};

/**
 * Outbound-redirect handler.
 * Validates the target URL and redirects immediately (0s delay, no interstitial countdown).
 */
export default async function OutPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;
  const rawTargetUrl = validateOutboundUrl(url);
  const targetUrl = rawTargetUrl
    ? appendOutboundUtm(rawTargetUrl, {
        medium: "news_outbound",
        campaign: "news_source",
      })
    : null;

  if (targetUrl) {
    redirect(targetUrl);
  }

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <StabloHeader />

      <main className="pb-20">
        <div className="mx-auto max-w-2xl px-4 pt-16 text-center sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
              無效的連結
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              此轉址連結的網址參數無效或遺失，無法前往原網站。
            </p>
            <Link
              href="/news"
              className="mt-6 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              ← 返回所有健康新聞
            </Link>
          </div>
        </div>
      </main>

      <StabloFooter />
    </div>
  );
}
