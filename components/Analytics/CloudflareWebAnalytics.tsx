import Script from "next/script";
import { env } from "@/lib/server/config/env";

/**
 * Cloudflare Web Analytics (no-cookie) beacon — issue #456. A cross-check
 * alongside the existing GoogleTag/MicrosoftClarity analytics (both left
 * untouched by this change), added via Cloudflare's standard manual JS
 * beacon snippet rather than the dashboard's "automatic setup" (which
 * injects the script at the edge via the proxy and isn't needed here since
 * this repo already manages its own <head>/<body> script tags).
 *
 * No-ops entirely (renders nothing) until a human provisions a real token
 * from the Cloudflare dashboard (Analytics > Web Analytics > Manage Site >
 * "I'll add the JavaScript snippet myself to my page") and sets
 * CLOUDFLARE_WEB_ANALYTICS_TOKEN in production — same optional-credential
 * convention as the other fields in lib/server/config/env.ts
 * (`process.env.X?.trim() || null`).
 */
export default function CloudflareWebAnalytics() {
  if (!env.cloudflareWebAnalyticsToken) return null;

  return (
    <Script
      id="cloudflare-web-analytics"
      strategy="afterInteractive"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token: env.cloudflareWebAnalyticsToken })}
    />
  );
}
