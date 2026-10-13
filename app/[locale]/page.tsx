import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listDiverseHomeNews } from "@/lib/server/news/queries";
import { buildHomeGraphJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";
import StabloNewsLayout from "@/components/News/StabloNewsLayout";
import HomeStatusBar from "@/components/Home/HomeStatusBar";
import GuideCardsSection from "@/components/Home/GuideCardsSection";
import RecentToolsSection from "@/components/Home/RecentToolsSection";
import { isPathLocale, ogAlternateLocales, OG_LOCALE } from "@/lib/i18n/dictionary";
import { getLocalizedPageMeta } from "@/lib/i18n/pageContent";
import { buildHreflangAlternates, buildLocalizedPath, PATH_LOCALES } from "@/lib/i18n/translatedPages";

/**
 * Issue #487 — locale-aware twin of app/(zh)/(site)/page.tsx (the issue
 * #472 homepage rebuild: status bar + 5 life-situation cards + recent-tools
 * + news). This is the most complex page in this ticket's scope and a new
 * route *type*: no prior ticket built a locale-prefixed homepage.
 *
 * Design decision on the embedded news list (explicitly called out by the
 * issue): `StabloNewsLayout` and its news items are rendered completely
 * unchanged from the zh page — real, live-published news articles are not
 * machine-translated, and the shared news-list chrome (headline/category/
 * pagination strings) follows the exact precedent ToolPageShell already set
 * in issue #485 of leaving *sitewide* shared components (StabloHeader/
 * StabloFooter/the news layout itself) untranslated, translating only each
 * page's OWN unique content. For the homepage, that "own content" is
 * HomeStatusBar + GuideCardsSection + RecentToolsSection (issue #472's own
 * additions) — all 3 now read every string through useLanguage()'s t() or
 * (GuideCardsSection, a Server Component) the `locale` prop passed below,
 * so this page's unique chrome is fully translated while the news section
 * stays exactly as a Chinese reader sees it.
 */

export const revalidate = 60;
export const runtime = "nodejs";

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

const CANONICAL_PATH = "/";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();
  const meta = getLocalizedPageMeta("home", locale);
  const baseUrl = getBaseUrl();
  const canonical = `${baseUrl}${buildLocalizedPath(CANONICAL_PATH, locale)}`;
  const languages = buildHreflangAlternates(CANONICAL_PATH, baseUrl) ?? undefined;

  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical, languages },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      type: "website",
      title: meta.title,
      description: meta.description,
      url: canonical,
      siteName: SITE_NAME,
      locale: OG_LOCALE[locale],
      alternateLocale: ogAlternateLocales(locale),
      images: [{ url: `${baseUrl}/images/og/home.png`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: [`${baseUrl}/images/og/home.png`],
    },
  };
}

export default async function LocaleHome({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isPathLocale(locale)) notFound();

  const items = await listDiverseHomeNews(30, 3);
  const homeGraph = buildHomeGraphJsonLd(items);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homeGraph) }} />
      <StabloNewsLayout
        items={items}
        variant="home"
        homeTopSections={
          <>
            <HomeStatusBar />
            <GuideCardsSection locale={locale} />
            <RecentToolsSection />
          </>
        }
      />
    </>
  );
}
