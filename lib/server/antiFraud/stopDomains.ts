/**
 * Domains at which checkSuspiciousUrl's candidate-climbing stops — see the
 * big comment on `buildCandidateHosts` in ./checkSuspiciousUrl.ts for why
 * this exists: without it, a hit on a shared public suffix or a
 * multi-tenant platform's own root domain would falsely flag every
 * subdomain under it (every *.com.tw site, every *.myshopify.com store).
 *
 * This is deliberately a small, hand-maintained list rather than a
 * dependency (no `psl`/`tldts` in package.json, and the 2.0 plan is
 * actively trimming dependencies — see docs/domains for that direction) —
 * just the public suffixes and platform domains actually relevant to this
 * tool's traffic (government-notice reports and Taiwan-facing scam sites).
 * Extend this list as new platform domains show up in synced data (a
 * `*.some-platform.com` row in `fraud_domains` whose parent is a shared
 * host, not a single operator, is the signal to add one).
 */
export const STOP_DOMAINS: ReadonlySet<string> = new Set([
  // Common public suffixes (bare TLD and Taiwan's compound second-level
  // domains) — never a real single-operator registrable domain.
  "tw",
  "com.tw",
  "net.tw",
  "org.tw",
  "idv.tw",
  "gov.tw",
  "edu.tw",
  "com",
  "net",
  "org",
  "info",
  "biz",

  // International platform / hosting domains where individual tenants get
  // their own subdomain (confirmed live in the 176455 dataset itself —
  // e.g. "u0pmj3-kv.myshopify.com" and "funny-daffodil-cd1f66.netlify.app"
  // are both real rows, each flagging one tenant, not the platform).
  "myshopify.com",
  "netlify.app",
  "vercel.app",
  "pages.dev",
  "github.io",
  "blogspot.com",
  "wordpress.com",
  "weebly.com",
  "wixsite.com",
  "web.app",
  "firebaseapp.com",
  "herokuapp.com",
  "business.site",
  "pixnet.net",
]);
