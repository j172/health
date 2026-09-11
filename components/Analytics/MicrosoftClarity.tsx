import Script from "next/script";

export const CLARITY_PROJECT_ID = "ye0lvdgk17";

export default function MicrosoftClarity() {
  return (
    <Script
      id="microsoft-clarity-init"
      strategy="lazyOnload"
      dangerouslySetInnerHTML={{
        __html: `
          (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");

          try {
            var consent = localStorage.getItem('j172-consent-analytics');
            if (consent === 'denied' && typeof window.clarity === 'function') {
              window.clarity('consent', false);
            } else if (consent === 'granted' && typeof window.clarity === 'function') {
              window.clarity('consent', true);
            }
          } catch (e) {}
        `,
      }}
    />
  );
}
