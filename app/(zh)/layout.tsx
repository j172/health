import { Inter } from "next/font/google";
import "../globals.css";
import type { Metadata, Viewport } from "next";
import Provider from "./(site)/Provider";
import { buildSiteGraphJsonLd, getBaseUrl, SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME } from "@/lib/server/news/seo";
import PrivacyConsentBanner from "@/components/Legal/PrivacyConsentBanner";
import InAppBrowserBanner from "@/components/Common/InAppBrowserBanner";
import RegisterServiceWorker from "@/components/Pwa/RegisterServiceWorker";
import GoogleTag from "@/components/Analytics/GoogleTag";
import AnalyticsTracker from "@/components/Analytics/AnalyticsTracker";
import MicrosoftClarity from "@/components/Analytics/MicrosoftClarity";
import CloudflareWebAnalytics from "@/components/Analytics/CloudflareWebAnalytics";
import SkipToContent from "@/components/Accessibility/SkipToContent";
import TyphoonBanner from "@/components/Typhoon/TyphoonBanner";
import EarthquakeBanner from "@/components/Earthquake/EarthquakeBanner";
import CbsEmergencyBanner from "@/components/Emergency/CbsEmergencyBanner";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  fallback: [
    "system-ui",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "PingFang TC",
    "Microsoft JhengHei",
    "sans-serif",
  ],
});

export const viewport: Viewport = {
  themeColor: "#625df5",
  // `viewport-fit=cover` is required for `env(safe-area-inset-bottom)` (used
  // by SiteNav.tsx's mobile bottom nav bar, issue #473) to resolve to the
  // device's actual gesture-nav inset on iOS Safari — without it, Safari
  // never extends the layout under the inset and the env() value stays 0.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  keywords: SITE_KEYWORDS,
  description: SITE_DESCRIPTION,
  icons: { icon: "/images/favicon.ico", apple: "/images/icon/pwa-192.png" },
  appleWebApp: { capable: true, title: "j172tw Healthz", statusBarStyle: "default" },
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
  // issue #485: the home page isn't itself one of this ticket's 3 pilot
  // translated pages yet (it's on the eventual ~21-page list future tickets
  // #486/#487/#488 will grow TRANSLATED_PAGES to cover) — so unlike before,
  // this does NOT declare `?lang=en|ja|ko` alternates any more. Those were
  // exactly the broken hreflang entries the issue calls out: Googlebot
  // fetching `?lang=en` got back zh-Hant-TW HTML. Once the home page gets a
  // real /en/ version, its own `alternates.languages` (via
  // buildHreflangAlternates) will declare the real thing here.
  alternates: {
    canonical: getBaseUrl(),
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    locale: "zh_TW",
    alternateLocale: ["en_US", "ja_JP", "ko_KR"],
    images: [{ url: `${getBaseUrl()}/images/og/home.png`, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [`${getBaseUrl()}/images/og/home.png`],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Site-wide Organization + WebSite(SearchAction) + SiteNavigationElement
  // @graph, rendered on every route via this single root layout (issue #458).
  // Pages with their own richer entity graph (home/news/tools/llm-info) also
  // declare these same @id-addressed entities again in their own @graph —
  // that duplication is harmless (Google merges/dedupes by matching @id) and
  // this root-level copy is what guarantees true site-wide coverage for the
  // remaining routes (e.g. /privacy, /accessibility, /emergency) that don't
  // build their own composite graph.
  const siteGraph = buildSiteGraphJsonLd();

  return (
    <html lang="zh-Hant-TW" suppressHydrationWarning>
      <head>
        <link rel="alternate" type="application/rss+xml" title={`${SITE_NAME} - 最新公衛與健康新聞 (RSS 2.0)`} href="/feed.xml" />
        <link rel="alternate" type="text/plain" title={`${SITE_NAME} - LLM / AI Index (llms.txt)`} href="/llms.txt" />
        <link rel="alternate" type="text/plain" title={`${SITE_NAME} - LLM Full Knowledge Base (llms-full.txt)`} href="/llms-full.txt" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteGraph) }}
        />
      </head>
      <body
        // Reserves space below the page below 1024px so SiteNav.tsx's fixed
        // mobile bottom nav bar (issue #473) never overlaps the last bit of
        // page content; matches its own `lg:hidden` breakpoint and adds its
        // safe-area inset again so the spacer is never shorter than the bar
        // actually renders at.
        className={`dark:bg-black ${inter.className} pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0`}
        suppressHydrationWarning
      >
        <GoogleTag />
        <AnalyticsTracker />
        <MicrosoftClarity />
        <CloudflareWebAnalytics />
        <Provider>
          <SkipToContent />
          <TyphoonBanner />
          <EarthquakeBanner />
          <CbsEmergencyBanner />
          <InAppBrowserBanner />
          <div id="main-content" tabIndex={-1} className="outline-none">
            {children}
          </div>
        </Provider>
        <PrivacyConsentBanner />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
