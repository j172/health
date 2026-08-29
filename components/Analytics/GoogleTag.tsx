import Script from "next/script";

export const GA_MEASUREMENT_ID = "G-V0CTGFQXW2";

export default function GoogleTag() {
  return (
    <>
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

