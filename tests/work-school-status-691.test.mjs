import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

// Issue #691 — 今天要上班上課嗎？ (government office calendar + link-only
// guidance to the official natural-disaster work/class suspension page).
//
// This file covers the cross-cutting acceptance criteria that no single unit
// test owns: the catalog entry, the en/ja/ko flow, sitemap + llms.txt +
// llms-full.txt + JSON-LD, the 颱風地震來了 guide step, the homepage status-bar
// chip, and — most importantly — that the closure half stays honest: no
// per-county status, no scraping of the dgpa.gov.tw page, always the official
// link and the "非本站判定" attribution, and a page that still renders in full
// when the calendar API is down.

const REPO_ROOT = new URL("../", import.meta.url);
const ROOT_DIR = fileURLToPath(REPO_ROOT);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    // The one DB-backed import under sitemap()/the llms routes: swap in empty news lists.
    if (specifier === "@/lib/server/news/queries") {
      return {
        url:
          "data:text/javascript," +
          encodeURIComponent(
            "export const listNewsForSitemap = async () => [];" +
              "export const listRecentNewsForLlms = async () => [];",
          ),
        shortCircuit: true,
      };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      return { format: "json", source: fs.readFileSync(fileURLToPath(url), "utf8"), shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const read = (...segments) => fs.readFileSync(path.join(ROOT_DIR, ...segments), "utf8").replace(/\r\n/g, "\n");
const SLUG = "work-school-status";

const { TOOL_CATALOG, TOOL_GROUP_META } = await import("../lib/server/tools/catalog.ts");
const { GUIDES, buildGuide } = await import("../lib/server/tools/navModel.ts");
const translatedPages = await import("../lib/i18n/translatedPages.ts");
const { getLocalizedToolMeta } = await import("../lib/i18n/toolContent.ts");
const { getLocalizedGuideMeta } = await import("../lib/i18n/guideContent.ts");
const seo = await import("../lib/server/news/seo.ts");
const closure = await import("../lib/tools/workSchoolStatus/closureGuidance.ts");

const tool = TOOL_CATALOG.find((entry) => entry.slug === SLUG);
const BASE = seo.getBaseUrl();

// ---------------------------------------------------------------------------
// 1. catalog entry
// ---------------------------------------------------------------------------

test("the tool has a catalog entry in disaster-alerts with keywords, directAnswer, lastUpdated, FAQs and sources", () => {
  assert.ok(tool, "TOOL_CATALOG must contain work-school-status");
  assert.equal(tool.group, "disaster-alerts");
  assert.ok(tool.keywords.length >= 5);
  for (const keyword of ["補班日", "停班停課", "颱風假", "上班日"]) {
    assert.ok(tool.keywords.includes(keyword), `keyword ${keyword}`);
  }
  assert.ok(tool.directAnswer.length >= 40 && tool.directAnswer.length <= 110, `directAnswer length ${tool.directAnswer.length}`);
  assert.match(tool.lastUpdated, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(tool.schemaType, "WebPage", "an administrative calendar is not a MedicalWebPage");
  assert.ok(tool.faqs.length >= 5);
  const urls = tool.scientificBasis.map((ref) => ref.url);
  assert.ok(urls.includes("https://data.gov.tw/dataset/14718"));
  assert.ok(urls.includes("https://www.dgpa.gov.tw/typh/daily/nds.html"));
  for (const slug of tool.relatedSlugs) assert.ok(TOOL_CATALOG.some((t) => t.slug === slug), `related slug ${slug} exists`);
});

test("disaster-alerts still has room (<= 15 tools) and the tool belongs to exactly one group", () => {
  const inGroup = TOOL_CATALOG.filter((entry) => entry.group === "disaster-alerts");
  assert.ok(inGroup.length <= 15, `disaster-alerts has ${inGroup.length} tools`);
  assert.ok(TOOL_GROUP_META.some((meta) => meta.group === "disaster-alerts"));
});

test("title, description, directAnswer and FAQs never claim live per-county closure status — they say it is not this site's call", () => {
  const surface = [tool.title, tool.description, tool.directAnswer].join("\n");
  assert.match(tool.description, /不判定/);
  assert.match(tool.directAnswer, /非判定單位|不判定|非本站判定/);
  assert.match(tool.directAnswer, /人事行政總處/);
  assert.ok(!/(即時|最新)[^，。；]{0,8}(各縣市|縣市)[^，。；]{0,8}(停班|停課)/.test(surface), "no 'live county closure' claim");
  assert.ok(!/(各縣市|縣市)[^，。；]{0,8}(停班|停課)[^，。；]{0,8}(即時|最新|一覽)/.test(surface), "no 'county closure list' claim");
  assert.ok(!/(已|將)(宣布)?停班/.test(surface), "no statement that work is cancelled");
  // The FAQ that explains why there is no status is present and honest.
  const why = tool.faqs.find((faq) => faq.question.includes("為什麼不直接顯示"));
  assert.ok(why, "an FAQ must explain why closures are not shown");
  assert.match(why.answer, /官方公告連結/);
  assert.match(why.answer, /不轉載|不顯示/);
});

// ---------------------------------------------------------------------------
// 2. en / ja / ko flow
// ---------------------------------------------------------------------------

test("the tool is in the translated-tool registry and the i18n scope roadmap, with real en/ja/ko content", () => {
  assert.ok(translatedPages.TRANSLATED_TOOL_SLUGS.includes(SLUG));
  assert.ok(translatedPages.isTranslatedPath(`/tools/${SLUG}`));
  assert.ok(translatedPages.I18N_SCOPE_PAGES.map(translatedPages.scopeEntryPath).includes(`/tools/${SLUG}`));

  for (const locale of ["en", "ja", "ko"]) {
    const meta = getLocalizedToolMeta(SLUG, locale);
    assert.ok(meta.title.trim() && meta.description.trim() && meta.directAnswer.trim(), `${locale} text`);
    assert.equal(meta.faqs.length, tool.faqs.length, `${locale} translates every FAQ`);
    assert.notEqual(meta.title, tool.title);
    // The honesty wording survives translation: no locale may promise live closure data.
    assert.ok(!/real-time|live status|リアルタイム|실시간/i.test(meta.title + meta.directAnswer), `${locale} must not claim real-time closures`);
  }
});

test("each locale route exists and reuses the shared shell + content component (no forked copy)", () => {
  const localePage = read("app", "[locale]", "tools", SLUG, "page.tsx");
  assert.match(localePage, /ToolPageShell/);
  assert.match(localePage, /WorkSchoolStatusContent/);
  assert.match(localePage, /getLocalizedToolMeta\("work-school-status", locale\)/);
  assert.match(localePage, /buildHreflangAlternates\(CANONICAL_PATH, baseUrl\)/);

  const zhPage = read("app", "(zh)", "tools", SLUG, "page.tsx");
  assert.match(zhPage, /ToolPageShell slug="work-school-status"/);
  assert.match(zhPage, /WorkSchoolStatusContent/);
  assert.match(zhPage, /buildHreflangAlternates\("\/tools\/work-school-status", baseUrl\)/);
});

const USED_KEY_PATTERN = /workSchoolStatusTool\.([A-Za-z]+)/g;

test("every workSchoolStatusTool.* key the content component uses exists, non-empty, in en, ja and ko", () => {
  const component = read("components", "Tools", "WorkSchoolStatusContent.tsx");
  const used = new Set([...component.matchAll(USED_KEY_PATTERN)].map((m) => m[1]));
  // Keys built from CLOSURE_LINK_KEYS are written as bare names in that table.
  for (const m of component.matchAll(/key: "([A-Za-z]+)"/g)) used.add(m[1]);
  assert.ok(used.size >= 35, `expected the component to use many keys, found ${used.size}`);

  for (const locale of ["en", "ja", "ko"]) {
    const dict = JSON.parse(read("locales", `${locale}.json`));
    const block = dict.workSchoolStatusTool;
    assert.ok(block, `${locale}.json needs a workSchoolStatusTool block`);
    for (const key of used) {
      assert.ok(typeof block[key] === "string" && block[key].trim().length > 0, `${locale}.json workSchoolStatusTool.${key}`);
    }
    // And no orphan keys: every translated string is used.
    for (const key of Object.keys(block)) assert.ok(used.has(key), `${locale}.json has unused key workSchoolStatusTool.${key}`);
  }
});

test("en, ja and ko carry the same workSchoolStatusTool keys, and the {placeholders} survive translation", () => {
  const blocks = ["en", "ja", "ko"].map((locale) => JSON.parse(read("locales", `${locale}.json`)).workSchoolStatusTool);
  const keys = Object.keys(blocks[0]).sort();
  for (const block of blocks) assert.deepEqual(Object.keys(block).sort(), keys);
  for (const key of keys) {
    const placeholders = blocks.map((b) => (b[key].match(/\{[a-z]+\}/g) || []).sort().join(","));
    assert.equal(new Set(placeholders).size, 1, `placeholders of ${key} differ across locales: ${placeholders.join(" | ")}`);
  }
});

test("the catalog title and the homepage status-bar strings exist in en, ja and ko", () => {
  for (const locale of ["en", "ja", "ko"]) {
    const dict = JSON.parse(read("locales", `${locale}.json`));
    assert.ok(dict.catalog[SLUG]?.trim(), `${locale} catalog.${SLUG}`);
    for (const key of [
      "workdayMakeup",
      "workdayOffWeekend",
      "workdayOff",
      "workdayOffNamedTemplate",
      "workdayUnknown",
      "nextHolidayLabel",
      "todayOffLabel",
      "workdayWorkdayLabel",
      "countdownTemplate",
      "tomorrowOffTemplate",
    ]) {
      assert.ok(dict.homePage.statusBar[key]?.trim(), `${locale} homePage.statusBar.${key}`);
    }
    assert.match(dict.homePage.statusBar.workdayOffNamedTemplate, /\{name\}/);
    assert.match(dict.homePage.statusBar.countdownTemplate, /\{days\}/);
    assert.match(dict.homePage.statusBar.countdownTemplate, /\{name\}/);
    assert.match(dict.homePage.statusBar.tomorrowOffTemplate, /\{name\}/);
  }
});

test("government data stays in Chinese: holiday names are rendered with lang=zh-TW, links go to the official (Chinese) pages", () => {
  const component = read("components", "Tools", "WorkSchoolStatusContent.tsx");
  assert.ok((component.match(/lang="zh-TW"/g) || []).length >= 2, "holiday names carry lang=zh-TW");
  assert.match(component, /closureMoreHeading/);
});

// ---------------------------------------------------------------------------
// 3. sitemap, llms.txt, llms-full.txt, JSON-LD
// ---------------------------------------------------------------------------

const { default: sitemap } = await import("../app/sitemap.ts");
const { GET: getLlmsTxt } = await import("../app/llms.txt/route.ts");
const { GET: getLlmsFullTxt } = await import("../app/llms-full.txt/route.ts");
const sitemapEntries = await sitemap();
const llmsTxt = await (await getLlmsTxt()).text();
const llmsFullTxt = await (await getLlmsFullTxt()).text();

test("sitemap lists the tool and its en/ja/ko siblings, all with reciprocal hreflang alternates", () => {
  const byUrl = new Map(sitemapEntries.map((entry) => [entry.url, entry]));
  const zhUrl = `${BASE}/tools/${SLUG}`;
  assert.ok(byUrl.has(zhUrl), "zh URL in sitemap");
  const expected = translatedPages.buildHreflangAlternates(`/tools/${SLUG}`, BASE);
  assert.ok(expected);
  assert.deepEqual(byUrl.get(zhUrl).alternates?.languages, expected);
  for (const locale of ["en", "ja", "ko"]) {
    const url = `${BASE}/${locale}/tools/${SLUG}`;
    assert.ok(byUrl.has(url), `${url} in sitemap`);
    assert.deepEqual(byUrl.get(url).alternates?.languages, expected);
  }
});

test("llms.txt and llms-full.txt list the tool, and the translated-pages section links its real /en /ja /ko URLs", () => {
  for (const [name, text] of [["llms.txt", llmsTxt], ["llms-full.txt", llmsFullTxt]]) {
    assert.ok(text.includes(`${BASE}/tools/${SLUG}`), `${name} must list the zh tool URL`);
    for (const locale of ["en", "ja", "ko"]) {
      assert.ok(text.includes(`${BASE}/${locale}/tools/${SLUG}`), `${name} must link ${locale}`);
    }
  }
  assert.ok(llmsFullTxt.includes("今天要上班上課嗎"), "llms-full carries the tool's name/description block");
  assert.ok(llmsFullTxt.includes("本站不判定"), "llms-full carries the honest description");
});

test("the typhoon guide step shows up in llms-full.txt with its tool URL", () => {
  assert.ok(llmsFullTxt.includes(`(${BASE}/tools/${SLUG})`), "guide step line links the tool");
  assert.ok(llmsFullTxt.includes("確認是否停班停課"));
});

test("JSON-LD graph: a WebPage + WebApplication + FAQPage with every FAQ, dateModified and the dataset citation", () => {
  const graph = seo.buildToolGraphJsonLd(tool)["@graph"];
  const page = graph.find((node) => node["@id"] === `${BASE}/tools/${SLUG}#webpage`);
  assert.equal(page["@type"], "WebPage");
  assert.equal(page.dateModified, tool.lastUpdated);
  assert.match(page.abstract, /人事行政總處/);
  assert.ok(page.citation.some((c) => c.url === "https://data.gov.tw/dataset/14718"));
  assert.ok(graph.some((node) => node["@type"] === "WebApplication"));
  const faq = graph.find((node) => node["@type"] === "FAQPage");
  assert.equal(faq.mainEntity.length, tool.faqs.length);
  const breadcrumb = graph.find((node) => node["@type"] === "BreadcrumbList");
  assert.equal(breadcrumb.itemListElement.at(-1).item, `${BASE}/tools/${SLUG}`);
});

test("JSON-LD for a locale page is localized and links back to the zh page", () => {
  const entry = { ...tool, ...getLocalizedToolMeta(SLUG, "ja") };
  const graph = seo.buildToolGraphJsonLd(entry, { locale: "ja" })["@graph"];
  const page = graph.find((node) => node["@id"] === `${BASE}/ja/tools/${SLUG}#webpage`);
  assert.ok(page);
  assert.equal(page.inLanguage, "ja");
  assert.deepEqual(page.translationOfWork, { "@type": "WebPage", url: `${BASE}/tools/${SLUG}`, inLanguage: "zh-TW" });
});

// ---------------------------------------------------------------------------
// 4. 颱風地震來了 guide
// ---------------------------------------------------------------------------

test("the typhoon-earthquake guide has a 確認是否停班停課 step right after the weather-alerts step, linking the tool", () => {
  const guide = GUIDES.find((g) => g.slug === "typhoon-earthquake");
  const slugs = guide.steps.map((step) => step.toolSlug);
  assert.equal(slugs[0], "weather-alerts");
  assert.equal(slugs[1], SLUG, "the closure step comes straight after the warning step");
  const step = guide.steps[1];
  assert.equal(step.caption, "確認是否停班停課");
  assert.match(step.why, /本站不判定/);
  assert.match(step.why, /官方公告/);

  const model = buildGuide("typhoon-earthquake");
  assert.equal(model.steps[1].href, `/tools/${SLUG}`);
});

test("the guide step is translated into en, ja and ko and keeps the 'this site does not decide' message", () => {
  for (const locale of ["en", "ja", "ko"]) {
    const step = getLocalizedGuideMeta("typhoon-earthquake", locale).steps[SLUG];
    assert.ok(step?.caption.trim() && step?.why.trim(), `${locale} guide step`);
  }
  assert.match(getLocalizedGuideMeta("typhoon-earthquake", "en").steps[SLUG].why, /does not determine/);
});

// ---------------------------------------------------------------------------
// 5. homepage status bar
// ---------------------------------------------------------------------------

test("HomeStatusBar has a consolidated 下個假日 / 今日放假 holiday pill linking the tool, with no typhoon special-casing and no shortcut button", () => {
  const bar = read("components", "Home", "HomeStatusBar.tsx");
  assert.match(bar, /nextHolidayLabel/);
  assert.match(bar, /"\/tools\/work-school-status"/);
  assert.match(bar, /buildHomeNextHolidayChip\(/);
  assert.match(bar, /sections\?\.workday/);
  assert.ok(!/WorkdayTomorrowShortcut/.test(bar), "HomeStatusBar must not render the legacy WorkdayTomorrowShortcut button");
  assert.ok(!/tomorrowShortcutLabel/.test(bar));
  assert.ok(!/tomorrowWorkdayLabel/.test(bar), "HomeStatusBar must not render a separate tomorrow workday pill");
  // home-alerts-severity-and-workday-tomorrow (follow-up to #691): the red
  // typhoon-warning pill is gone — 今天上班上課/明日上班 only ever reflect the
  // office calendar now. A typhoon warning is surfaced elsewhere (the
  // site-wide TyphoonBanner, issue #744) and the /tools/work-school-status
  // page's own ClosureGuidanceSection, both untouched by this file.
  assert.ok(!/typhoonWarning/.test(bar), "HomeStatusBar must not special-case a typhoon warning any more");
  assert.ok(!/workdayTyphoon/.test(bar));
  // The clock comes from the shared mounted-only hook, never from Date.now() during render.
  assert.match(bar, /const nowMs = useMinuteClock\(\);/);
  assert.ok(!/Date\.now\(\)/.test(bar), "HomeStatusBar must not read the clock itself");
  const hook = read("lib", "hooks", "useMinuteClock.ts");
  assert.match(hook, /useEffect\(/);
  assert.match(hook, /setTimeout\(\(\) => setNowMs\(Date\.now\(\)\), 0\)/);
});

test("the status-bar answer comes from the visitor's clock over the API's rows, so an edge-cached response can't show yesterday", () => {
  const route = read("lib", "server", "officeCalendar", "homeWorkday.ts");
  assert.match(route, /days: window\.rows\.filter/);
  assert.ok(!/state:\s*"workday"/.test(route), "the server must not pre-bake today's answer into a cached payload");
});

test("buildHomeWorkdayChip no longer takes a typhoon-warning argument, and homeWorkday.ts no longer fetches one for the status bar", () => {
  const calendarSrc = read("lib", "tools", "workSchoolStatus", "calendar.ts");
  assert.match(calendarSrc, /buildHomeWorkdayChip = \(rows: readonly OfficeCalendarDay\[\], now: Date \| number\): HomeWorkdayChip/);
  assert.ok(!/typhoonWarning/.test(calendarSrc));
  const homeWorkdaySrc = read("lib", "server", "officeCalendar", "homeWorkday.ts");
  assert.ok(!/typhoonWarning/.test(homeWorkdaySrc));
  assert.ok(!/isTyphoonWarningActive/.test(homeWorkdaySrc));
});

// ---------------------------------------------------------------------------
// 6. the closure half stays honest
// ---------------------------------------------------------------------------

test("closure guidance is link-only: no live status, the official URL first, the attribution present", () => {
  const guidance = closure.buildClosureGuidance(null);
  assert.equal(guidance.mode, "link-only");
  assert.equal(closure.CLOSURE_SOURCE_MODE, "link-only");
  assert.equal(guidance.liveStatusAvailable, false);
  assert.equal(guidance.reasonCode, "no-stable-machine-readable-source");
  assert.equal(guidance.officialUrl, "https://www.dgpa.gov.tw/typh/daily/nds.html");
  assert.match(guidance.attributionZh, /非本站判定/);
  assert.equal(guidance.links.filter((l) => l.primary).length, 1);
  assert.equal(guidance.links.find((l) => l.primary).url, guidance.officialUrl);
  for (const link of guidance.links) assert.match(link.url, /^https:\/\//);
  // No per-county anything in the guidance object.
  assert.ok(!Object.keys(guidance).some((key) => /count(y|ies)|region|status(es)?$/i.test(key)), `unexpected keys ${Object.keys(guidance)}`);
});

test("the typhoon-warning flag passes through unchanged and defaults to unknown (null) rather than false", () => {
  assert.equal(closure.buildClosureGuidance(true).typhoonWarningActive, true);
  assert.equal(closure.buildClosureGuidance(false).typhoonWarningActive, false);
  assert.equal(closure.buildClosureGuidance(null).typhoonWarningActive, null);
});

test("nothing in the app fetches or parses the dgpa.gov.tw closure page: it only appears as a link constant, in the catalog and in the page copy", () => {
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === ".next" ? [] : walk(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  const files = ["app", "components", "lib"].flatMap((dir) => walk(path.join(ROOT_DIR, dir)));
  const mentions = files.filter((file) => /typh\/daily\/nds/.test(fs.readFileSync(file, "utf8")));
  const allowed = new Set([
    "lib/tools/workSchoolStatus/closureGuidance.ts",
    "lib/server/tools/catalog.ts",
  ]);
  for (const file of mentions) {
    const rel = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
    assert.ok(allowed.has(rel), `${rel} mentions the closure page URL; it may only be linked, never fetched`);
  }
  assert.ok(mentions.length >= 2);

  // And no server-side code anywhere reads closure data over HTTP by name.
  for (const file of files.filter((f) => f.includes(`${path.sep}server${path.sep}`) || f.includes(`${path.sep}api${path.sep}`))) {
    const code = fs.readFileSync(file, "utf8");
    if (!/httpGetText|httpGetJson|httpRequest|cheerio/.test(code)) continue;
    assert.ok(!/nds\.html|dgpa\.gov\.tw\/typh/.test(code), `${file} must not fetch the closure page`);
  }
});

test("the page renders the closure guidance unconditionally and never builds a per-county table", () => {
  const component = read("components", "Tools", "WorkSchoolStatusContent.tsx");
  // Rendered in the component's main return, outside every data-dependent branch.
  const mainReturn = component.slice(component.indexOf("export default function WorkSchoolStatusContent"));
  assert.ok(mainReturn.includes("<ClosureGuidanceSection"), "ClosureGuidanceSection is rendered");
  // A direct child of the page's root <div>, a sibling that follows the calendar <section> — not inside any
  // `answer ? … : null` / `failed ? … : null` branch — and it takes only the CWA warning flag, never calendar data.
  assert.match(
    mainReturn,
    /<\/section>\s*<ClosureGuidanceSection typhoonWarning=\{typhoonWarning\} t=\{t\} \/>\s*<\/div>\s*\);\s*\}\s*$/,
    "ClosureGuidanceSection must be the last unconditional child of the root element",
  );
  assert.ok(!/<table|<Table/i.test(component), "no table of counties");
  assert.ok(!/TAIWAN_COUNTY|counties|縣市名稱/.test(component), "no county list in the page");
  // It carries the honesty copy and the one primary action.
  assert.match(component, /closureNotShownTitle/);
  assert.match(component, /closureAttribution/);
  assert.match(component, /data-testid="closure-primary-link"/);
  assert.match(component, /rel: "noopener noreferrer"/);
});

test("when the calendar API fails the page shows an explicit error with a way out, not an empty or guessed answer", () => {
  const component = read("components", "Tools", "WorkSchoolStatusContent.tsx");
  assert.match(component, /const failed = status === "error" && !data;/);
  assert.match(component, /role="alert"/);
  assert.match(component, /loadErrorHint/);
  assert.match(component, /DGPA_CALENDAR_PAGE_URL/);
  assert.match(component, /onClick=\{refresh\}/);
  // Today/tomorrow are only ever derived from API rows, never from the weekday.
  assert.match(component, /buildWorkdayAnswer\(data\.days, nowMs\)/);
  assert.ok(!/getDay\(|getUTCDay\(/.test(component), "the component must not infer working days from the weekday");
});

test("the page flags a seed fallback and a missing-data state in the source footer instead of looking authoritative", () => {
  const component = read("components", "Tools", "WorkSchoolStatusContent.tsx");
  assert.match(component, /calendar\.source === "seed" \|\| calendar\.source === "mixed"/);
  assert.match(component, /calendar\.source === "none"/);
  assert.match(component, /seedRetrievedAt/);
  assert.match(component, /windowTruncated && coveredTo/);
});

test("outbound links go through appendOutboundUtm (site-wide UTM rule)", () => {
  const component = read("components", "Tools", "WorkSchoolStatusContent.tsx");
  assert.match(component, /appendOutboundUtm\(/);
  assert.ok(!/href="https?:/.test(component), "no literal external href");
});

// ---------------------------------------------------------------------------
// 7. docs
// ---------------------------------------------------------------------------

test("the disaster domain doc and the scheduling doc record the new tool and its cron", () => {
  const disaster = read("docs", "domains", "07-tools-disaster-environment-energy.md");
  assert.match(disaster, /work-school-status/);
  assert.match(disaster, /link-only|連結導流/);
  const scheduling = read("docs", "domains", "10-scheduling-sync-ci.md");
  assert.match(scheduling, /34 6 \* \* 3/);
});
