import Link from "next/link";
import { notFound } from "next/navigation";
import { getNewsById, listNewsAssetsByNewsId } from "@/lib/server/news/queries";
import { StabloFooter, StabloHeader } from "@/components/News/StabloNewsLayout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const toTaipei = (value: Date | null): string => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(new Date(value));
};

export default async function NewsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    notFound();
  }

  const news = await getNewsById(numericId);
  if (!news) {
    notFound();
  }

  const assets = await listNewsAssetsByNewsId(news.id);

  return (
    <div className="min-h-screen bg-white text-neutral-800">
      <StabloHeader />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <Link href="/news" className="inline-flex items-center text-sm font-normal text-neutral-500 transition-colors hover:text-neutral-800">
          ← Back to Archive
        </Link>

        <p className="mt-8 text-[14px] font-medium text-neutral-500">{news.feed_name}</p>
        <h1 className="mb-3 mt-3 text-[30px] font-semibold leading-9 tracking-[-0.025em] text-neutral-800">{news.title}</h1>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-[14px] text-neutral-500">
          <span>{news.dept_name || "衛生福利部"}</span>
          <span>•</span>
          <time>{toTaipei(news.published_at_utc)}</time>
          <span>•</span>
          <a href={news.canonical_url} target="_blank" rel="noreferrer noopener" className="underline decoration-neutral-300 underline-offset-4 transition-colors hover:decoration-neutral-700">
            原始來源
          </a>
        </div>

        <article className="prose prose-neutral mt-10 max-w-none prose-headings:tracking-tight prose-p:text-[16px] prose-p:leading-7 prose-a:text-neutral-800">
          <div dangerouslySetInnerHTML={{ __html: news.detail_html || news.description_html || "<p>無可用內容</p>" }} />
        </article>

        {assets.length > 0 ? (
          <section className="mt-12 rounded-none border border-neutral-200 p-6">
            <h2 className="mb-4 text-xl font-semibold">附件 / 圖片</h2>
            <ul className="space-y-2 text-sm text-neutral-700">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <a href={asset.url} target="_blank" rel="noreferrer noopener" className="underline decoration-neutral-300 underline-offset-4 transition-colors hover:decoration-neutral-700">
                    [{asset.asset_type}] {asset.title || asset.url}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <StabloFooter />
    </div>
  );
}