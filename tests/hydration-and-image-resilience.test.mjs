import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("useGeolocation initial state is hydration-safe (no synchronous localStorage read)", () => {
  const file = path.join(process.cwd(), "components/Facilities/useGeolocation.ts");
  const content = fs.readFileSync(file, "utf8");

  // Verify useState does not call getSavedLocation inside its initialiser
  const useStateMatch = content.match(/useState<GeoState>\(\(\)\s*=>\s*([\s\S]*?)\);\r?\n\s*const attempted/);
  assert.ok(useStateMatch, "should find useState<GeoState> initializer");
  assert.ok(
    !useStateMatch[1].includes("getSavedLocation"),
    "useState initial state must NOT read getSavedLocation synchronously (causes React 418 hydration error)",
  );
  assert.ok(
    useStateMatch[1].includes("isDefault: true"),
    "initial state must have isDefault: true to match SSR output exactly",
  );

  // Verify getSavedLocation is synced inside useEffect after mount
  assert.ok(
    content.includes("const saved = getSavedLocation();"),
    "must call getSavedLocation inside useEffect for post-hydration sync",
  );
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

