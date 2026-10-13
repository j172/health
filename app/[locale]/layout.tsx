import { Inter } from "next/font/google";
import "../globals.css";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import Provider from "../(zh)/(site)/Provider";
import { buildSiteGraphJsonLd, getBaseUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/server/news/seo";
import PrivacyConsentBanner from "@/components/Legal/PrivacyConsentBanner";
import InAppBrowserBanner from "@/components/Common/InAppBrowserBanner";
import RegisterServiceWorker from "@/components/Pwa/RegisterServiceWorker";
import GoogleTag from "@/components/Analytics/GoogleTag";
import MicrosoftClarity from "@/components/Analytics/MicrosoftClarity";
import CloudflareWebAnalytics from "@/components/Analytics/CloudflareWebAnalytics";
import SkipToContent from "@/components/Accessibility/SkipToContent";
import { PATH_LOCALES, isPathLocale, type PathLocale } from "@/lib/i18n/dictionary";

/**
 * Issue #485 (parent #438 §Q) — root layout for the /en/, /ja/, /ko/
 * path-prefixed locale tree.
 *
 * This is a SEPARATE Next.js "root layout" from app/(zh)/layout.tsx (both
 * are root layouts per https://nextjs.org/docs/app/api-reference/file-conventions/layout
 * — "any layout without a layout.js above it is a root layout"; there is no
 * app/layout.tsx any more at the true top level, only this one and the
 * (zh) route group's). That split is the only way to get a genuinely
 * different, request-correct `<html lang>` attribute in the SERVER-rendered
 * HTML without opting the entire site into dynamic (non-ISR) rendering —
 * a shared root layout can't read the URL's locale segment without a
 * Dynamic API (headers()/cookies()), and calling one there would force
 * every existing zh page to skip its cache on every single request (see
 * app/(zh)/tools/er-status/page.tsx's own comment on exactly this trade-off
 * for its 30s-revalidate hospital-congestion query).
 *
 * `app/(zh)/(site)/Provider.tsx` is reused as-is (imported with a relative
 * path one level up and across) rather than forked, so the two root
 * layouts share the exact same ThemeProvider/LanguageProvider/Toaster/
 * ScrollToTop wiring — the only difference is the `forcedLocale` prop
 * passed here, which locks the language context to this route's locale
 * instead of letting it auto-detect/store a preference (see
 * app/context/LanguageContext.tsx).
 */

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
  viewportFit: "cover",
};

export function generateStaticParams() {
  return PATH_LOCALES.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
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
};

export default async function LocaleRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Defensive: generateStaticParams only ever produces en/ja/ko, but a
  // direct request for an unexpected /{locale}/ segment (or an ISR
  // fallback render) must 404 instead of silently rendering as some
  // locale — this is also acceptance-criterion-7's guardrail at the routing
  // layer: nothing under here claims to be a real page unless it is one.
  if (!isPathLocale(locale)) notFound();
  const pathLocale: PathLocale = locale;

  // Same site-wide Organization + WebSite(SearchAction) graph the (zh) root
  // layout renders (issue #458) — duplicated here rather than imported as
  // a function call with side effects, since JSON-LD has no `inLanguage`
  // concept of its own here; the @graph's @id-addressed entities are
  // locale-independent anyway (an Organization doesn't change per reader).
  const siteGraph = buildSiteGraphJsonLd();

  return (
    <html lang={pathLocale} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteGraph) }}
        />
      </head>
      <body
        className={`dark:bg-black ${inter.className} pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0`}
        suppressHydrationWarning
      >
        <GoogleTag />
        <MicrosoftClarity />
        <CloudflareWebAnalytics />
        <Provider forcedLocale={pathLocale}>
          <SkipToContent />
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
