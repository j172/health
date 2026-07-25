import Link from "next/link";
import { notFound } from "next/navigation";
import { getNewsById, listNewsAssetsByNewsId } from "@/lib/server/news/queries";

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
    <section className="pt-28 pb-16">
      <div className="container mx-auto max-w-4xl px-4">
        <Link href="/news" className="mb-6 inline-block text-sm text-primary hover:underline">
          ← 回新聞列表
        </Link>

        <h1 className="mb-4 text-3xl font-bold text-white">{news.title}</h1>

        <div className="mb-8 space-y-1 text-sm text-gray-300">
          <p>類別：{news.feed_name}</p>
          <p>單位：{news.dept_name || "-"}</p>
          <p>發布時間：{toTaipei(news.published_at_utc)}</p>
          <p>
            原始連結：
            <a href={news.canonical_url} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
              {news.canonical_url}
            </a>
          </p>
        </div>

        <article className="prose prose-invert max-w-none rounded-lg border border-white/10 bg-white/5 p-6">
          <div dangerouslySetInnerHTML={{ __html: news.detail_html || news.description_html || "<p>無可用內容</p>" }} />
        </article>

        {assets.length > 0 ? (
          <section className="mt-8 rounded-lg border border-white/10 bg-white/5 p-6">
            <h2 className="mb-3 text-xl font-semibold text-white">附件 / 圖片</h2>
            <ul className="space-y-2 text-sm">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <a href={asset.url} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline">
                    [{asset.asset_type}] {asset.title || asset.url}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  );
}