import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNewsById, listNewsAssetsByNewsId } from "@/lib/server/news/queries";
import { buildArticleJsonLd, buildArticleMetadata } from "@/lib/server/news/seo";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { StabloFooter, StabloHeader } from "@/components/News/StabloNewsLayout";
import NewsArticleBody from "@/components/News/NewsArticleBody";

export const runtime = "nodejs";
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return {};
  }

  const news = await getNewsById(numericId);
  if (!news) {
    return {};
  }

  return buildArticleMetadata(news);
}

const toTaipei = (value: Date | null): string => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(new Date(value));
};

const readingTime = (value: string | null): number => {
  const characters = value?.replace(/\s+/g, "").length || 0;
  return Math.max(1, Math.ceil(characters / 400));
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
  const hero = assets.find((asset) => asset.asset_type === "image" && /^https?:\/\//i.test(asset.url));
  const attachments = assets.filter((asset) => asset.asset_type === "attachment" && /^https?:\/\//i.test(asset.url));
  const articleHtml = news.detail_html || news.description_html || "<p>此則新聞目前沒有可顯示的完整內容。</p>";
  const jsonLd = buildArticleJsonLd(news);
  const authorLabel = resolveAuthorLabel(news);

  return (
    <div className="min-h-screen bg-white text-neutral-800">
      {jsonLd.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <StabloHeader />

      <main>
        <article>
        <header className="mx-auto max-w-screen-lg px-6 pb-8 pt-12 text-center sm:px-8 sm:pt-16 lg:pb-12 lg:pt-20">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{news.feed_name}</p>
          <h1 className="mx-auto mt-5 max-w-4xl text-[2.1rem] font-semibold leading-[1.12] tracking-[-0.035em] text-neutral-900 sm:text-[3rem] lg:text-[3.75rem]">
            {news.title}
          </h1>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-neutral-500">
            <span className="font-medium text-neutral-700">{authorLabel}</span>
            <span aria-hidden="true">•</span>
            <time>{toTaipei(news.published_at_utc)}</time>
            <span aria-hidden="true">•</span>
            <span>{readingTime(news.detail_text)} 分鐘閱讀</span>
          </div>
        </header>

        {hero ? (
          <figure className="mx-auto max-w-screen-lg px-4 sm:px-8">
            {/* External MOHW images are rendered directly to avoid coupling article availability to Next image optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero.url} alt={hero.title || news.title} className="max-h-[42rem] w-full bg-neutral-100 object-contain" />
            {hero.title ? <figcaption className="mt-3 text-center text-xs text-neutral-500">{hero.title}</figcaption> : null}
          </figure>
        ) : null}

        <div className="mx-auto max-w-3xl px-6 pb-6 pt-10 sm:px-8 sm:pt-14">
          <NewsArticleBody html={articleHtml} title={news.title} sourceUrl={news.canonical_url} />

          {attachments.length > 0 ? (
            <section className="mt-14 border-y border-neutral-200 py-7" aria-labelledby="news-attachments-title">
              <h2 id="news-attachments-title" className="text-lg font-semibold text-neutral-900">
                相關附件
              </h2>
              <ul className="mt-4 space-y-3 text-[15px] leading-6">
                {attachments.map((asset) => (
                  <li key={asset.id}>
                    <a href={asset.url} target="_blank" rel="noreferrer noopener" className="text-neutral-700 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-neutral-950 hover:decoration-neutral-700">
                      {asset.title || asset.url}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="mt-12 flex items-center justify-between gap-4 border-b border-neutral-200 pb-8 text-sm">
            <Link href="/news" className="font-medium text-neutral-700 transition-colors hover:text-neutral-950">
              ← 查看所有新聞
            </Link>
            <a href={news.canonical_url} target="_blank" rel="noreferrer noopener" className="text-neutral-500 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-neutral-900">
              原始來源 ↗
            </a>
          </div>

          <aside className="mt-8 bg-neutral-50 px-6 py-7 sm:px-8" aria-label="新聞來源">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">新聞來源</p>
            <h2 className="mt-2 text-xl font-semibold text-neutral-900">{authorLabel}</h2>
            <p className="mt-3 text-[15px] leading-7 text-neutral-600">本頁彙整自政府機關及新聞媒體之公開資訊，內容與附件以原始來源公告為準。</p>
          </aside>
        </div>
        </article>
      </main>

      <StabloFooter />
    </div>
  );
}