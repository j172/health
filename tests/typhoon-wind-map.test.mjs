import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Windy.com wind-map embed on /tools/weather-alerts, shown only while a typhoon
// warning is in force. Confirmed live (2026-10-21): the plain www.windy.com
// interactive URL sends `Content-Security-Policy: frame-ancestors 'self'
// *.windy.com:*`, which refuses to render in anyone else's <iframe>; only the
// dedicated embed.windy.com/embed2.html path is actually embeddable.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...segments) => fs.readFileSync(path.join(ROOT, ...segments), "utf-8");

test("TyphoonWindMap embeds the iframe-safe embed2.html path, not the CSP-blocked www.windy.com URL", () => {
  const src = read("components", "Tools", "TyphoonWindMap.tsx");
  assert.match(src, /const WINDY_EMBED_URL = `https:\/\/embed\.windy\.com\/embed2\.html\?/);
  assert.match(src, /<iframe\s+src=\{WINDY_EMBED_URL\}/);
  // The attribution link to windy.com itself is fine — only the <iframe src> must never point there.
  assert.doesNotMatch(
    src,
    /const WINDY_EMBED_URL = `https:\/\/www\.windy\.com\//,
    "www.windy.com's own CSP (frame-ancestors) blocks iframe embedding — the URL fed to the <iframe> must use embed.windy.com",
  );
  assert.match(src, /overlay=wind/);
  assert.match(src, /const WINDY_LAT = 24\.96;/);
  assert.match(src, /const WINDY_LON = 121\.239;/);
  assert.match(src, /const WINDY_ZOOM = 5;/);
});

test("TyphoonWindMap discloses it loads a third-party site, UTM-wrapped like every other outbound link", () => {
  const src = read("components", "Tools", "TyphoonWindMap.tsx");
  assert.match(src, /第三方網站/);
  assert.match(src, /import \{ appendOutboundUtm \} from "@\/lib\/format\/outboundLink"/);
  assert.match(src, /href=\{appendOutboundUtm\("https:\/\/www\.windy\.com\/", WINDY_ATTRIBUTION_UTM\)\}/);
});

test("the iframe has an accessible title and lazy loading", () => {
  const src = read("components", "Tools", "TyphoonWindMap.tsx");
  assert.match(src, /<iframe[\s\S]*?title="[^"]+"/);
  assert.match(src, /<iframe[\s\S]*?loading="lazy"/);
});

test("weather-alerts page only renders TyphoonWindMap when shouldShowTyphoonBanner(typhoonStatus) is true", () => {
  const src = read("app", "(zh)", "tools", "weather-alerts", "page.tsx");
  assert.match(src, /import TyphoonWindMap from "@\/components\/Tools\/TyphoonWindMap"/);
  assert.match(src, /import \{ loadTyphoonStatus \} from "@\/lib\/server\/typhoon\/status"/);
  assert.match(src, /import \{ shouldShowTyphoonBanner \} from "@\/lib\/typhoon\/typhoonStatus"/);
  assert.match(src, /const showTyphoonWindMap = shouldShowTyphoonBanner\(typhoonStatus\)/);
  assert.match(src, /\{showTyphoonWindMap \? <TyphoonWindMap \/> : null\}/);
});
