import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNewsById, listNewsAssetsByNewsId, listRelatedNews } from "@/lib/server/news/queries";
import { buildArticleJsonLd, buildArticleMetadata } from "@/lib/server/news/seo";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { getSourceBadgeStyle } from "@/lib/server/news/sourceCategories";
import { StabloFooter, StabloHeader } from "@/components/News/StabloNewsLayout";
import NewsArticleBody from "@/components/News/NewsArticleBody";
import ArticleReaderToolbar from "@/components/News/ArticleReaderToolbar";
import NewsCard from "@/components/News/NewsCard";

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

  const [assets, relatedItems] = await Promise.all([
    listNewsAssetsByNewsId(news.id),
    listRelatedNews(news.source_name, news.id, 3),
  ]);

  const heroAsset = assets.find((asset) => asset.asset_type === "image" && /^https?:\/\//i.test(asset.url));
  const hero = heroAsset
    ? { url: heroAsset.url, caption: heroAsset.title, isPixabay: false }
    : news.card_image_url && news.card_image_source === "pixabay"
      ? { url: news.card_image_url, caption: null, isPixabay: true }
      : null;
  const attachments = assets.filter((asset) => asset.asset_type === "attachment" && /^https?:\/\//i.test(asset.url));
  const keywords = Array.from(new Set((news.keywords ?? "").split(",").map((value) => value.trim()).filter(Boolean)));
  const articleHtml = news.detail_html || news.description_html || "<p>此則新聞目前沒有可顯示的完整內容。</p>";
  const jsonLd = buildArticleJsonLd(news);
  const authorLabel = resolveAuthorLabel(news);
  const badgeStyle = getSourceBadgeStyle(news.source_name);

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      {jsonLd.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <StabloHeader />

      <main className="pb-20">
        {/* NextBlog Reader Container (Centered ~800px) */}
        <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 lg:px-8">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="mb-8 text-xs font-semibold text-slate-400">
            <ol className="flex flex-wrap items-center gap-x-2">
              <li>
                <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400">首頁</Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/news" className="hover:text-indigo-600 dark:hover:text-indigo-400">健康新聞</Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="max-w-xs truncate text-slate-600 dark:text-slate-300" aria-current="page">
                {news.title}
              </li>
            </ol>
          </nav>

          <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-10 lg:p-12">
            {/* Header */}
            <header className="text-center">
              <div className="flex items-center justify-center gap-2">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${badgeStyle.bg} ${badgeStyle.text}`}>
                  {news.feed_name}
                </span>
              </div>
              <h1 className="mt-5 text-2xl font-extrabold leading-snug tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl lg:text-4xl">
                {news.title}
              </h1>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className="font-bold text-slate-800 dark:text-slate-200">{authorLabel}</span>
                <span aria-hidden="true">•</span>
                <time>{toTaipei(news.published_at_utc)}</time>
                <span aria-hidden="true">•</span>
                <span>{readingTime(news.detail_text)} 分鐘閱讀</span>
              </div>
            </header>

            {/* Interactive Reader Toolbar: Voice Text-to-Speech & Immersive Reader Mode */}
            <ArticleReaderToolbar
              title={news.title}
              authorLabel={authorLabel}
              publishDateStr={toTaipei(news.published_at_utc)}
              geoSummary={news.geo_summary}
              articleHtml={articleHtml}
            />

            {/* GEO Summary & AI Citation Box for LLM / AI Search Engines */}
            {news.geo_summary?.trim() ? (
              <div id="geo-summary" className="mt-8 rounded-2xl border border-indigo-200/80 bg-indigo-50/50 p-5 text-sm leading-relaxed text-slate-800 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-slate-200 shadow-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <span>💡</span>
                    <span>AI 核心摘要 (GEO Index)</span>
                  </p>
                  <span className="text-[10px] text-slate-400 font-mono">Generative Search Ready</span>
                </div>
                <p className="leading-relaxed">{news.geo_summary.trim()}</p>
              </div>
            ) : null}

            {/* Hero Image */}
            {hero ? (
              <figure className="mt-8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={hero.url}
                  alt={hero.caption || news.title}
                  className="max-h-[32rem] w-full rounded-2xl bg-slate-100 object-cover shadow-sm dark:bg-slate-800"
                />
                {hero.caption ? (
                  <figcaption className="mt-3 text-center text-xs text-slate-400">{hero.caption}</figcaption>
                ) : hero.isPixabay ? (
                  <figcaption className="mt-3 text-center text-xs text-slate-400">
                    示意圖：Pixabay {news.card_image_contributor ? ` · ${news.card_image_contributor}` : ""}
                  </figcaption>
                ) : null}
              </figure>
            ) : null}

            {/* Article Content Body */}
            <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800">
              <NewsArticleBody html={articleHtml} title={news.title} sourceUrl={news.canonical_url} />
            </div>

            {/* Keywords / Tags */}
            {keywords.length > 0 ? (
              <div className="mt-10 flex flex-wrap gap-2 pt-6 border-t border-slate-100 dark:border-slate-800">
                {keywords.map((keyword) => (
                  <Link
                    key={keyword}
                    href={`/news?keyword=${encodeURIComponent(keyword)}`}
                    className="inline-block rounded-full bg-slate-100 px-3.5 py-1 text-xs font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-indigo-400 transition-colors"
                  >
                    #{keyword}
                  </Link>
                ))}
              </div>
            ) : null}

            {/* Attachments Card */}
            {attachments.length > 0 ? (
              <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-850">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  📎 相關附件檔案下載
                </h3>
                <ul className="mt-3 space-y-2 text-xs">
                  {attachments.map((asset) => (
                    <li key={asset.id}>
                      <a
                        href={asset.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-medium text-indigo-600 underline decoration-indigo-200 underline-offset-4 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                      >
                        {asset.title || asset.url} ↗
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Article Footer Navigation & Original Link */}
            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-6 text-xs dark:border-slate-800">
              <Link
                href="/news"
                className="font-bold text-slate-700 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 transition-colors"
              >
                ← 返回所有健康新聞
              </Link>
              <a
                href={news.canonical_url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition-colors"
              >
                前往官方原始網頁 ↗
              </a>
            </div>
          </article>

          {/* Related Articles Section */}
          {relatedItems.length > 0 && (
            <section className="mt-16 border-t border-slate-200 pt-10 dark:border-slate-800" aria-label="相關文章">
              <h2 className="mb-8 text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                最新相關文章推薦
              </h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {relatedItems.map((item) => (
                  <NewsCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <StabloFooter />
    </div>
  );
}