import Script from "next/script";

export const GA_MEASUREMENT_ID = "G-V0CTGFQXW2";

export default function GoogleTag() {
  return (
    <>
      {/*
        False positive: this rule's isInAppDir check only tests whether the
        linted file's own path contains an "/app/" segment (see
        no-before-interactive-script-outside-document.js in
        @next/eslint-plugin-next). This component is rendered exclusively
        from App Router layouts (app/(site)/layout.tsx, app/news/layout.tsx,
        app/privacy/layout.tsx, app/tools/layout.tsx) but lives under
        components/, so the path check never exempts it even though
        beforeInteractive is valid and required here: it sets Google Consent
        Mode defaults before gtag.js loads below.
      */}
      {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
      <Script
        id="google-consent-init"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            
            var storedAnalytics = 'denied';
            try {
              if (localStorage.getItem('j172-consent-analytics') === 'granted') {
                storedAnalytics = 'granted';
              }
            } catch (e) {}

            gtag('consent', 'default', {
              'analytics_storage': storedAnalytics,
              'ad_storage': 'denied',
              'ad_user_data': 'denied',
              'ad_personalization': 'denied'
            });
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}', {
              page_path: window.location.pathname,
            });
          `,
        }}
      />
      <Script
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      />
    </>
  );
}

