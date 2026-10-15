import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("useSharedGeolocation initial state is hydration-safe (static values, no synchronous storage read)", () => {
  // The old components/Facilities/useGeolocation.ts (whose useState initialiser
  // this test used to guard) was deleted once every caller moved to the shared
  // hook (PRD #438 §K). The same hydration rule applies to the shared hook:
  // server and first client render must both see the same static idle state.
  const file = path.join(process.cwd(), "lib/hooks/useSharedGeolocation.ts");
  const content = fs.readFileSync(file, "utf8");

  assert.ok(
    content.includes('useState<SharedGeolocationStatus>("idle")'),
    'status must start as the static "idle" so SSR and the first client render match (a synchronous sessionStorage read here causes React 418)',
  );
  assert.ok(
    content.includes("useState<SharedGeolocationCoords | null>(null)"),
    "coords must start as static null so SSR and the first client render match",
  );

  // The session cache is only consulted from run(), which the mount effect
  // defers via queueMicrotask — never from a useState initialiser.
  assert.ok(
    !/useState[^;]*readSessionCache/.test(content),
    "useState initialisers must NOT call readSessionCache synchronously",
  );
  assert.ok(content.includes("queueMicrotask"), "the cached-result path must be deferred past hydration via queueMicrotask");
});

test("getSavedLocation lives in lib/client/savedLocation.ts and is only ever read after mount (never in a useState initialiser)", () => {
  const savedLocation = fs.readFileSync(path.join(process.cwd(), "lib/client/savedLocation.ts"), "utf8");
  assert.ok(savedLocation.includes("export function getSavedLocation"), "getSavedLocation must be exported from lib/client/savedLocation.ts");
  assert.ok(savedLocation.includes('typeof window === "undefined"'), "getSavedLocation must be SSR-safe");

  const widget = fs.readFileSync(path.join(process.cwd(), "components/Tools/LocalWeatherSvgWidget.tsx"), "utf8");
  assert.ok(
    widget.includes('from "@/lib/client/savedLocation"'),
    "LocalWeatherSvgWidget must import getSavedLocation from lib/client/savedLocation",
  );
  assert.ok(!/useState[^;]*getSavedLocation/.test(widget), "useState initialisers must NOT call getSavedLocation synchronously");
});

test("LocalWeatherSvgWidget initializes selectedCounty to 'auto' to prevent hydration mismatch", () => {
  const file = path.join(process.cwd(), "components/Tools/LocalWeatherSvgWidget.tsx");
  const content = fs.readFileSync(file, "utf8");

  assert.ok(
    content.includes('const [selectedCounty, setSelectedCounty] = useState<string>("auto");'),
    'selectedCounty must initialize to "auto" to match server render',
  );
  assert.ok(
    /const saved = getSavedLocation\(\);\s*if \(saved\?\.name\) \{\s*setSelectedCounty\(saved\.name\);/.test(content),
    "selectedCounty must sync with getSavedLocation inside useEffect",
  );
});

test("Date rendering elements include suppressHydrationWarning across news and tool components", () => {
  const targets = [
    { file: "components/News/NewsCard.tsx", pattern: /suppressHydrationWarning[\s\S]*?toTaipei\(displayDate\(item\)\)/ },
    { file: "components/News/HeroPost.tsx", pattern: /suppressHydrationWarning[\s\S]*?toTaipei\(displayDate\(hero\)\)/ },
    { file: "components/News/HeroPost.tsx", pattern: /suppressHydrationWarning[\s\S]*?toTaipei\(displayDate\(item\)\)/ },
    { file: "components/News/NewsSidebar.tsx", pattern: /suppressHydrationWarning[\s\S]*?toTaipei\(displayDate\(item\)/ },
    { file: "components/Tools/EarthquakeSidebarWidget.tsx", pattern: /suppressHydrationWarning[\s\S]*?toTaipeiShort/ },
    { file: "components/Tools/WeatherAlertSidebarWidget.tsx", pattern: /suppressHydrationWarning[\s\S]*?until/ },
  ];

  for (const { file, pattern } of targets) {
    const fullPath = path.join(process.cwd(), file);
    const content = fs.readFileSync(fullPath, "utf8");
    assert.ok(pattern.test(content), `${file} must include suppressHydrationWarning for date/time rendering`);
  }
});

test("Image components flag external URLs as unoptimized to bypass failing server-side image proxy", () => {
  const components = [
    "components/News/CardThumb.tsx",
    "components/News/HeroPost.tsx",
    "components/News/HeroImage.tsx",
  ];

  for (const relPath of components) {
    const fullPath = path.join(process.cwd(), relPath);
    const content = fs.readFileSync(fullPath, "utf8");
    assert.ok(
      content.includes("/^https?:\\/\\//i.test(src)"),
      `${relPath} must flag external HTTP/HTTPS URLs as unoptimized to prevent 500 image errors`,
    );
  }
});

test("next.config.js remotePatterns does not contain invalid '**' hostname wildcards", () => {
  const fullPath = path.join(process.cwd(), "next.config.js");
  const content = fs.readFileSync(fullPath, "utf8");
  assert.ok(
    !content.includes('hostname: "**"'),
    "next.config.js must not use '**' in hostname in remotePatterns (invalid Next.js syntax)",
  );
});

test("Sidebar API routes include s-maxage in Cache-Control response headers", () => {
  const routes = [
    "app/api/cpc-prices/route.ts",
    "app/api/water-outages/route.ts",
    "app/api/cdc/travel-alerts/route.ts",
    "app/api/pest-alerts/route.ts",
    "app/api/weather-nearby/route.ts",
    "app/api/aqi/nearest/route.ts",
    "app/api/uv/nearest/route.ts",
  ];

  for (const relPath of routes) {
    const fullPath = path.join(process.cwd(), relPath);
    const content = fs.readFileSync(fullPath, "utf8");
    assert.ok(
      content.includes("s-maxage="),
      `${relPath} must include s-maxage in Cache-Control header to enable edge caching`,
    );
  }
});

test("useSidebarWidgetData default timeout is at least 10000ms", () => {
  const fullPath = path.join(process.cwd(), "components/Tools/useSidebarWidgetData.ts");
  const content = fs.readFileSync(fullPath, "utf8");
  assert.ok(
    content.includes("timeoutMs = 10000"),
    "useSidebarWidgetData default timeoutMs should be at least 10000ms",
  );
});

test("PrivacyConsentBanner and InAppBrowserBanner defer rendering with mounted guard to prevent React 418 hydration mismatch", () => {
  const privacyFile = path.join(process.cwd(), "components/Legal/PrivacyConsentBanner.tsx");
  const privacyContent = fs.readFileSync(privacyFile, "utf8");
  assert.ok(
    privacyContent.includes("const [mounted, setMounted] = useState(false);"),
    "PrivacyConsentBanner must define mounted state",
  );
  assert.ok(
    privacyContent.includes("if (!mounted || isAcked || dismissed) return null;"),
    "PrivacyConsentBanner must return null before mount to prevent client/server HTML mismatch",
  );

  const inAppFile = path.join(process.cwd(), "components/Common/InAppBrowserBanner.tsx");
  const inAppContent = fs.readFileSync(inAppFile, "utf8");
  assert.ok(
    inAppContent.includes("const [mounted, setMounted] = useState(false);"),
    "InAppBrowserBanner must define mounted state",
  );
  assert.ok(
    inAppContent.includes("if (!mounted || isAdminRoute || !app || dismissedInStorage || dismissed) return null;"),
    "InAppBrowserBanner must return null before mount to prevent in-app browser hydration mismatch",
  );
});

