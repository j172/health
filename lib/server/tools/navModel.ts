import {
  TOOL_CATALOG,
  TOOL_GROUP_META,
  getToolCatalogEntry,
  type ToolCatalogEntry,
  type ToolFaq,
  type ToolGroup,
  type ToolGroupMeta,
} from "./catalog";
import { compareByStrokeOrder } from "./strokeOrder";
import { appendOutboundUtm } from "@/lib/format/outboundLink";

/**
 * Catalog-derived navigation model builders (issue #443, the shared
 * foundation `buildNavModel`/`buildFooterModel`/`buildCategoryPage`/
 * `buildRedirects`/`buildGuide` named in issue #438 §A and master-plan.md
 * §3.3/§4.2).
 *
 * Every function here is pure: no DB, no browser, no React — given the same
 * `TOOL_CATALOG`/`TOOL_GROUP_META` input they always return the same output.
 * They exist so Nav (SiteNav.tsx), Footer (SiteFooter.tsx), the `/tools`
 * index, the future `/tools/category/[slug]` landing pages (#459) and the
 * future `/guides/[slug]` hub pages (#438 §3.3) can all derive their models
 * from one place instead of each hand-rolling (and inevitably drifting from)
 * their own category/guide/redirect lists. This ticket only builds and
 * tests these functions — it does not wire any of the UI components above
 * to call them; that is explicitly left to their own future tickets.
 */

// ---------------------------------------------------------------------------
// 1. Nav mega-menu model
// ---------------------------------------------------------------------------

export interface NavModelTool {
  slug: string;
  href: string;
  label: string;
}

export interface NavModelCategory {
  group: ToolGroup;
  /** Future `/tools/category/[slug]` landing page this category's header
   * links to (built by issue #459, not yet live). */
  href: string;
  label: string;
  tools: NavModelTool[];
}

export type NavModel = NavModelCategory[];

export interface BuildNavModelOptions {
  /** Passed through to `compareByStrokeOrder` for both the category order
   * and the tool order within each category — omit (or pass "zh-TW") for
   * the default stroke-order rule; "en"/"ja"/"ko" use that locale's native
   * collation instead, per the established Nav/Footer sort convention. */
  locale?: string;
  /** Localized tool label override, mirroring SiteNav.tsx/SiteFooter.tsx's
   * own `locale !== "zh-TW" ? t(\`catalog.${tool.slug}\`, zhLabel) : zhLabel`
   * call. Falls back to `tool.navLabel ?? tool.title` when omitted, or when
   * it returns null/undefined for a given tool. */
  translateToolLabel?: (tool: ToolCatalogEntry) => string | null | undefined;
  /** Localized category label override, mirroring the same components'
   * `t(meta.labelKey, meta.labelDefault)` call. Falls back to
   * `meta.labelDefault` when omitted. */
  translateGroupLabel?: (meta: ToolGroupMeta) => string | null | undefined;
}

/**
 * Derives the Nav mega-menu / mobile-drawer model: exactly 7 categories (one
 * per `TOOL_GROUP_META` entry), each holding every `TOOL_CATALOG` tool whose
 * `group` matches — i.e. this simply mirrors the catalog's current `group`
 * assignments, grouped and sorted, not a fresh judgment call (issue #438
 * §A). Both the category order and the tool order within each category use
 * the established stroke-order rule (Latin-named items first as one
 * alphabetical block, then Chinese items by first-character stroke count —
 * see `compareByStrokeOrder`), exactly as SiteNav.tsx/SiteFooter.tsx already
 * compute it inline.
 */
export function buildNavModel(options: BuildNavModelOptions = {}): NavModel {
  const { locale, translateToolLabel, translateGroupLabel } = options;

  const categories: NavModel = TOOL_GROUP_META.map((meta) => {
    const label = translateGroupLabel?.(meta) ?? meta.labelDefault;
    const tools: NavModelTool[] = TOOL_CATALOG.filter(
      (tool) => tool.group === meta.group,
    )
      .map((tool) => {
        const zhLabel = tool.navLabel ?? tool.title;
        return {
          slug: tool.slug,
          href: `/tools/${tool.slug}`,
          label: translateToolLabel?.(tool) ?? zhLabel,
        };
      })
      .sort((a, b) => compareByStrokeOrder(a.label, b.label, locale));

    return {
      group: meta.group,
      href: `/tools/category/${meta.group}`,
      label,
      tools,
    };
  });

  return categories.sort((a, b) => compareByStrokeOrder(a.label, b.label, locale));
}

// ---------------------------------------------------------------------------
// 2. Footer model
// ---------------------------------------------------------------------------

export interface FooterLinkModel {
  href: string;
  label: string;
}

export interface FooterBlockModel {
  id: string;
  label: string;
  links: FooterLinkModel[];
}

export type FooterModel = FooterBlockModel[];

/**
 * The footer's "公民倡議與友站" column (issue #438 §B: 4 columns —
 * 關於本站／7 分類／5 情境／公民友站 — "不設熱門工具欄", superseding an
 * earlier master-plan.md §4.2 draft that still had a popular-tools column).
 *
 * This repo already has this exact 7-link list in two places that agree on
 * every name + URL: `CIVIC_PARTNERS` in
 * components/Common/CivicPartnersSection.tsx and the inline
 * `civicPartnerLinks` array in components/News/SiteFooter.tsx. Neither is
 * imported here directly:
 *  - `CivicPartnersSection.tsx` is a `"use client"` component whose module
 *    body contains real JSX. This repo's `node --test` convention (see
 *    footerLinks.test.mjs) runs source files through Node's native
 *    type-stripping loader, which erases TypeScript types but does not
 *    transform JSX — importing that file here would make every test that
 *    transitively imports this module fail to parse.
 *  - `SiteFooter.tsx`'s copy isn't an importable constant; it's rebuilt
 *    inline per render with `t()` calls baked in.
 *
 * So this list transcribes the same 7 entries (verified byte-for-byte
 * against both sources below) into a plain, dependency-free module. A
 * future UI-wiring ticket that touches those two components can retire one
 * (or both) of them down to this single list — out of scope here, since
 * this ticket builds pure functions only and does not edit UI components.
 */
export const CIVIC_PARTNER_LINKS: FooterLinkModel[] = [
  { href: "https://g0v.tw/intl/zh-TW/", label: "g0v 零時政府" },
  { href: "https://kuma-academy.org/", label: "黑熊學院" },
  { href: "https://cw.yueyuknows.com/", label: "反認知作戰教育網" },
  { href: "https://metawilo.com/", label: "台灣罪犯圖鑑" },
  {
    href: "https://www.sports.gov.tw/News/6295",
    label: "運動部不適任教練專區",
  },
  {
    href: "https://ma.mohw.gov.tw/Accessibility/VIOSearch/MASearchVIO",
    label: "衛福部醫事性平專區",
  },
  { href: "https://council2026.taiwangogo.tw/", label: "2026 政治人物前科" },
];

export interface BuildFooterModelOptions {
  locale?: string;
  translateToolLabel?: (tool: ToolCatalogEntry) => string | null | undefined;
  translateGroupLabel?: (meta: ToolGroupMeta) => string | null | undefined;
  /** Localized overview/civic-partner link labels; keyed by a stable id
   * (the overview item's path without the leading slash, or the civic
   * partner's hostname) so callers can pass a `t()`-backed lookup without
   * this module needing to know about i18n keys. */
  translateLinkLabel?: (id: string, zhLabel: string) => string | null | undefined;
}

/**
 * Derives the Footer's 4 blocks (issue #438 §B): "關於本站" (static site
 * links), "工具分類" (the same 7 categories as the Nav, linking to the
 * future `/tools/category/[slug]` landing pages), "生活情境" (the 5
 * `GUIDES` hubs, linking to `/guides/[slug]`), and "公民倡議與友站" (the
 * existing 7 civic-partner links above). Deliberately has no "熱門工具"
 * column (explicitly ruled out in §B) and no individual `/tools/<slug>`
 * tool links anywhere in the output — the category column links to
 * category pages, not tools.
 */
export function buildFooterModel(
  options: BuildFooterModelOptions = {},
): FooterModel {
  const { locale, translateToolLabel, translateGroupLabel, translateLinkLabel } =
    options;

  const overview: FooterBlockModel = {
    id: "overview",
    label: "關於本站",
    links: [
      { id: "", zh: "首頁", href: "/" },
      { id: "news", zh: "新聞", href: "/news" },
      { id: "privacy", zh: "隱私", href: "/privacy" },
      { id: "accessibility", zh: "無障礙", href: "/accessibility" },
      { id: "llm-info", zh: "Hey AI", href: "/llm-info" },
    ].map(({ id, zh, href }) => ({
      href,
      label: translateLinkLabel?.(id || "home", zh) ?? zh,
    })),
  };

  const categoryLinks: FooterLinkModel[] = TOOL_GROUP_META.map((meta) => ({
    href: `/tools/category/${meta.group}`,
    label: translateGroupLabel?.(meta) ?? meta.labelDefault,
  })).sort((a, b) => compareByStrokeOrder(a.label, b.label, locale));

  const guideLinks: FooterLinkModel[] = GUIDES.map((guide) => ({
    href: `/guides/${guide.slug}`,
    label: guide.title,
  }));

  const civicPartnerLinks: FooterLinkModel[] = CIVIC_PARTNER_LINKS.map(
    (item) => ({
      href: appendOutboundUtm(item.href, {
        medium: "civic_partner",
        campaign: "civic_alliance",
        content: "footer",
      }),
      label:
        translateLinkLabel?.(new URL(item.href).hostname, item.label) ??
        item.label,
    }),
  );

  // Referenced only to keep `translateToolLabel` a recognized (if currently
  // unused-by-value) option for symmetry with buildNavModel's signature —
  // the footer's category column intentionally lists categories, not
  // individual tools, so there is nothing here to apply a tool-label
  // translator to.
  void translateToolLabel;

  return [
    overview,
    { id: "categories", label: "工具分類", links: categoryLinks },
    { id: "guides", label: "生活情境", links: guideLinks },
    { id: "civic-partners", label: "公民倡議與友站", links: civicPartnerLinks },
  ];
}

// ---------------------------------------------------------------------------
// 3. Category landing page model
// ---------------------------------------------------------------------------

export interface CategoryPageTool {
  slug: string;
  title: string;
  navLabel?: string;
  directAnswer: string;
}

export interface CategoryPageModel {
  group: ToolGroup;
  label: string;
  description: string;
  tools: CategoryPageTool[];
}

/**
 * Short, genuine (not boilerplate) descriptions for each of the 7 category
 * landing pages — issue #459 (blocked on this ticket) renders these as the
 * page's intro copy. Content follows master-plan.md §4.1's "內容" column,
 * written in the site's existing user-facing tone.
 */
const CATEGORY_DESCRIPTIONS: Record<ToolGroup, string> = {
  "health-assessment":
    "12 款健康自我評估計算器：BMI、熱量與三大營養素、飲水量、體脂率、腰臀比、目標心率、血壓分級、睡眠與壓力量表等，皆採用衛福部國健署或國際公認公式，協助使用者在家快速掌握自身健康數據。",
  "medical-care":
    "查詢全臺健保特約診所、藥局、急診即時量能、成人健檢與癌症篩檢、心理健康、戒菸、罕病照護、器捐醫院與藥品資訊，是使用者就醫用藥前最先該查的一站。",
  "elder-care-welfare":
    "長照服務地圖、身心障礙福利機構、庇護工場、助聽器與無障礙 ATM／交通查詢、NPO 公益團體與殯葬設施，彙整長輩與身心障礙者生活所需的社會福利資源。",
  family:
    "母嬰親善醫院、哺集乳室、幼兒園與補習班、兒少福利機構、本土語言學習與毛孩認養，陪伴使用者從孕期、育兒到毛孩照顧的每個階段。",
  "disaster-alerts":
    "地震、氣象警報、紫外線指數、防災與淹水地圖、停水查詢、緊急電話與避難物資計算、旅遊疫情與兒童安全地點，天災與緊急狀況發生前後都能在這裡查到即時資訊。",
  "environment-food":
    "AQI 空氣品質、室內空品、戶外安全、食品業者與食安資訊、營養標示、農藥販售、清潔隊與碳足跡／環保標章查詢，掌握日常環境與飲食安全的公開數據。",
  "life-culture":
    "YouBike、捷運與中油油價即時資訊、公廁與涼適點地圖、藝文活動、文化資產與觀光工廠，整理交通、生活機能與文化休閒的實用查詢工具。",
};

/**
 * Derives everything a `/tools/category/[slug]` landing page needs (issue
 * #459, blocked on this ticket): the category's label, a short description,
 * and its full tool list (slug/title/navLabel/directAnswer — enough for a
 * card grid without pulling in each tool's full FAQ/scientificBasis/etc.).
 *
 * Returns `null` for an invalid/unknown group slug rather than silently
 * returning an empty model, so a bad slug (typo, stale link, or a slug from
 * a group that no longer exists) surfaces clearly to the caller instead of
 * rendering a blank page.
 */
export function buildCategoryPage(groupSlug: string): CategoryPageModel | null {
  const meta = TOOL_GROUP_META.find((m) => m.group === groupSlug);
  if (!meta) return null;

  const tools: CategoryPageTool[] = TOOL_CATALOG.filter(
    (tool) => tool.group === meta.group,
  )
    .map((tool) => ({
      slug: tool.slug,
      title: tool.title,
      navLabel: tool.navLabel,
      directAnswer: tool.directAnswer,
    }))
    .sort((a, b) =>
      compareByStrokeOrder(a.navLabel ?? a.title, b.navLabel ?? b.title),
    );

  return {
    group: meta.group,
    label: meta.labelDefault,
    description: CATEGORY_DESCRIPTIONS[meta.group],
    tools,
  };
}

export interface ToolCategoryLink {
  group: ToolGroup;
  label: string;
  href: string;
}

/**
 * Resolves a tool's category breadcrumb destination — the single "what is
 * this tool's category label and URL" lookup shared by the visual
 * breadcrumb (ToolPageShell.tsx) and the BreadcrumbList JSON-LD
 * (`buildToolGraphJsonLd` in lib/server/news/seo.ts), so the 4-level
 * "首頁 / 工具 / 分類 / 工具" breadcrumb (issue #459) can't drift between its
 * two representations — both call this instead of hand-duplicating the
 * category label/URL string.
 *
 * Throws on an unknown group rather than returning `null`, unlike
 * `buildCategoryPage` — every `ToolCatalogEntry.group` is typed as
 * `ToolGroup` and must already match one of the 7 `TOOL_GROUP_META`
 * entries, so an unresolved group here means the catalog and the group
 * metadata have desynced, which is a programming error worth failing loudly
 * on rather than silently mis-rendering a tool page's breadcrumb.
 */
export function getToolCategoryLink(group: ToolGroup): ToolCategoryLink {
  const meta = TOOL_GROUP_META.find((m) => m.group === group);
  if (!meta) {
    throw new Error(`getToolCategoryLink: unknown tool group "${group}"`);
  }
  return {
    group: meta.group,
    label: meta.labelDefault,
    href: `/tools/category/${meta.group}`,
  };
}

// ---------------------------------------------------------------------------
// 3b. Related-tools auto-fill (issue #464)
// ---------------------------------------------------------------------------

/**
 * Resolves a tool's "相關工具" list for ToolPageShell.tsx: the manually
 * curated `ToolCatalogEntry.relatedSlugs` first, in their original order,
 * then — only when that curated list resolves to fewer than `limit` (default
 * 4) — auto-filled with other tools from the *same* `group`, in `TOOL_CATALOG`
 * array order, until there are `limit` tools or the category itself runs out
 * of other members.
 *
 * Curated entries never get reordered or bumped by an auto-filled one; this
 * only ever appends. Dedupes against the tool's own slug and against
 * whatever's already in the list (defensive — a hand-curated `relatedSlugs`
 * could in principle repeat a slug), and silently drops any curated slug
 * that doesn't resolve to a real catalog entry (matching ToolPageShell's
 * prior behavior before this ticket).
 *
 * Returns `[]` for an unknown slug and never throws — every one of the 7
 * post-#442 groups currently has at least 9 members (well above `limit`), so
 * running out of same-group tools to auto-fill with doesn't happen in
 * practice today, but a future group with fewer members is handled
 * gracefully: this just returns however many tools are actually available.
 *
 * `catalog` defaults to the real `TOOL_CATALOG` and callers never need to
 * pass it; it exists only so this function's own test suite can exercise
 * the "this tool's group has fewer than `limit` total members" edge case
 * against a tiny synthetic catalog, since no real group is currently that
 * small.
 */
export function getRelatedTools(
  slug: string,
  limit = 4,
  catalog: ToolCatalogEntry[] = TOOL_CATALOG,
): ToolCatalogEntry[] {
  const entry = catalog.find((t) => t.slug === slug);
  if (!entry) return [];

  const result: ToolCatalogEntry[] = [];
  const seen = new Set<string>([slug]);

  for (const relatedSlug of entry.relatedSlugs) {
    if (seen.has(relatedSlug)) continue;
    const tool = catalog.find((t) => t.slug === relatedSlug);
    if (!tool) continue;
    result.push(tool);
    seen.add(tool.slug);
  }

  if (result.length < limit) {
    for (const tool of catalog) {
      if (result.length >= limit) break;
      if (tool.group !== entry.group || seen.has(tool.slug)) continue;
      result.push(tool);
      seen.add(tool.slug);
    }
  }

  return result.slice(0, limit);
}

// ---------------------------------------------------------------------------
// 4. Merge redirects
// ---------------------------------------------------------------------------

export interface CatalogRedirect {
  source: string;
  destination: string;
  permanent: boolean;
  /** Which issue shipped this redirect, for traceability back to next.config.js's comments. */
  issue: string;
}

/**
 * The real, currently-shipped merge-related redirects already hardcoded in
 * `next.config.js`'s `redirects()` function — transcribed here, not
 * generated from it (next.config.js is CommonJS and isn't part of this
 * module graph), so this function's own test coverage can independently
 * verify every destination still resolves to a real `TOOL_CATALOG` entry.
 *
 * This list intentionally excludes `/emergency` → `/tools/emergency-hotlines`
 * — that redirect is a plain vanity shortcut, not the result of any catalog
 * merge (no tool slug named "emergency" was ever removed), so it doesn't fit
 * "已拍板的合併轉址" (finalized *merge* redirects) that this function covers.
 *
 * Per the ticket, this function does not replace or wire into
 * next.config.js's actual `redirects()` — that stays exactly as-is; this is
 * just the same set of rules available as data for anything else (tests,
 * docs, a future audit) that wants to reason about them without parsing
 * next.config.js.
 */
export const CATALOG_REDIRECTS: CatalogRedirect[] = [
  {
    source: "/tools/hakka-community",
    destination: "/tools/long-term-care?type=hakka-bogong",
    permanent: true,
    issue: "#484 (2.0 §D M4)",
  },
  {
    source: "/tools/tax-organizations",
    destination: "/tools/npo-organizations",
    permanent: true,
    issue: "pre-2.0",
  },
  {
    source: "/tools/child-welfare-nurseries",
    destination: "/tools/child-welfare-institutions",
    permanent: true,
    issue: "#256",
  },
  {
    source: "/tools/child-welfare-centers",
    destination: "/tools/child-welfare-institutions",
    permanent: true,
    issue: "#256",
  },
  {
    source: "/tools/green-hotels",
    destination: "/tools/green-certifications?tab=green-hotels",
    permanent: true,
    issue: "#448",
  },
  {
    source: "/tools/green-products",
    destination: "/tools/green-certifications?tab=green-products",
    permanent: true,
    issue: "#448",
  },
  {
    source: "/tools/green-restaurants",
    destination: "/tools/green-certifications?tab=green-restaurants",
    permanent: true,
    issue: "#448",
  },
  {
    source: "/tools/water-level-stations",
    destination: "/tools/water-conditions",
    permanent: true,
    issue: "pre-2.0",
  },
  {
    source: "/tools/reservoir-status",
    destination: "/tools/water-conditions",
    permanent: true,
    issue: "pre-2.0",
  },
  {
    source: "/tools/family-cultural-activities",
    destination: "/tools/cultural-events",
    permanent: true,
    issue: "pre-2.0",
  },
  {
    source: "/tools/carbon-footprint-products",
    destination: "/tools/carbon-footprint",
    permanent: true,
    issue: "pre-2.0",
  },
  {
    source: "/tools/carbon-footprint-coefficients",
    destination: "/tools/carbon-footprint",
    permanent: true,
    issue: "pre-2.0",
  },
  {
    source: "/tools/ltc-contracted",
    destination: "/tools/long-term-care",
    permanent: true,
    issue: "#447 (2.0 §D M1)",
  },
  {
    source: "/tools/green-shops",
    destination: "/tools/green-certifications?tab=green-shops",
    permanent: true,
    issue: "#448 (2.0 §D M2)",
  },
  {
    source: "/tools/cpc-stations",
    destination: "/tools/cpc-prices?tab=stations",
    permanent: true,
    issue: "#483 (2.0 §D M3)",
  },
  {
    source: "/tools/home-healthcare",
    destination: "/tools/long-term-care?type=home-healthcare",
    permanent: true,
    issue: "#484 (2.0 §D M4)",
  },
  {
    source: "/tools/elder-welfare",
    destination: "/tools/long-term-care?type=elder-welfare",
    permanent: true,
    issue: "#484 (2.0 §D M4)",
  },
  {
    source: "/tools/hakka-bogong",
    destination: "/tools/long-term-care?type=hakka-bogong",
    permanent: true,
    issue: "#484 (2.0 §D M4)",
  },
];

export function buildRedirects(): CatalogRedirect[] {
  return CATALOG_REDIRECTS;
}

// ---------------------------------------------------------------------------
// 5. Life-situation guides
// ---------------------------------------------------------------------------

export interface GuideStep {
  toolSlug: string;
  /** Short label for this step (e.g. a card title in the hub page). */
  caption: string;
  /** Why this tool matters at this specific point in the guide's journey. */
  why: string;
}

export interface Guide {
  slug: string;
  title: string;
  description: string;
  steps: GuideStep[];
  faqs: ToolFaq[];
}

/**
 * The 5 life-situation guides (issue #438 §3.3, GOV.UK step-by-step
 * pattern) — each strings together several tools from different catalog
 * groups into one ordered journey through a real life situation, instead of
 * making the user figure out which of the 7 categories to check next.
 *
 * Step sequences are the finalized ones from master-plan.md §3.3 / issue
 * #443, not placeholders. Per this project's standing content rule, copy
 * here uses plain "使用者" throughout — never persona labels like "觀光客"
 * or "病患".
 */
export const GUIDES: Guide[] = [
  {
    slug: "caring-for-elders",
    title: "家有長輩",
    description:
      "家中有長輩需要照顧時，從申請長照資源、規劃無障礙出行,到緊急時刻的居家急救,這份指南依使用情境排序,一步步帶使用者找到對應工具。",
    steps: [
      {
        toolSlug: "long-term-care",
        caption: "先查長照照顧圈",
        why: "多數長輩照顧需求的第一步是確認住家附近有哪些長照服務據點、居家照護與樂齡資源，長照照顧圈地圖把這些類型疊在同一張地圖上，直接看圈內有多少資源可用。",
      },
      {
        toolSlug: "senior-friendly",
        caption: "申請敬老卡、規劃樂齡旅遊",
        why: "長照之外，長輩的日常生活品質同樣重要——敬老卡能降低長輩外出的交通負擔，樂齡套票則是專為長輩體力與無障礙需求設計的行程，讓長輩不只是被照顧，也能安心出門。",
      },
      {
        toolSlug: "accessible-transit",
        caption: "確認無障礙交通工具",
        why: "長輩行動能力下降後，一般大眾運輸可能不夠友善，這裡能查到低地板公車、捷運無障礙設施、通用計程車與復康巴士，提早規劃就醫、採買等外出行程。",
      },
      {
        toolSlug: "hearing-aid-subsidies",
        caption: "評估助聽器補助資格",
        why: "聽力退化是長輩常被忽略的健康問題，會間接影響溝通與跌倒風險；這裡能查到提供公費聽力輔具評估的特約院所，先評估再申請補助。",
      },
      {
        toolSlug: "home-emergency-care",
        caption: "了解在宅急症照護選項",
        why: "長輩若突發感染等急症，不一定非得住院——健保在宅急症照護特約機構可提供在宅施打抗生素等醫療服務，是住院之外更貼近長輩生活的選項，留著備用。",
      },
    ],
    faqs: [
      {
        question: "長照服務和敬老卡可以同時申請嗎？",
        answer:
          "可以，兩者是不同體系：長照服務（如居家照護、日間照顧）由各縣市長照管理中心核定資格後提供，敬老卡則是縣市政府發給長輩的交通優惠卡，兩者沒有互斥關係，可依長輩實際需求同時申請。",
      },
      {
        question: "長輩還沒到長照資格門檻，可以用哪些工具？",
        answer:
          "敬老卡、樂齡旅遊套票與無障礙交通通常沒有長照資格限制，只要設籍當地、達到年齡門檻即可申請或使用；助聽器評估與在宅急症照護則依各自資格而定，建議先查詢工具內的申請條件說明。",
      },
      {
        question: "如果長輩住在偏鄉，這些資源查得到嗎？",
        answer:
          "長照照顧圈地圖與無障礙交通地圖皆以全臺資料建置，偏鄉資源確實可能較市區稀疏；地圖會依圈內資源數量提示是否需要擴大搜尋半徑，協助使用者評估實際可及的資源範圍。",
      },
    ],
  },
  {
    slug: "pregnancy-to-parenting",
    title: "懷孕到育兒",
    description:
      "從懷孕待產、哺乳到孩子上幼兒園，這份指南依照時間順序排列相關工具，幫助即將或正在育兒的使用者，掌握每個階段該查詢的公開資源。",
    steps: [
      {
        toolSlug: "baby-friendly-hospitals",
        caption: "挑選母嬰親善醫院",
        why: "待產前先確認鄰近有哪些取得母嬰同室、母乳哺育認證的醫療院所，有助於後續哺餵與產後照顧銜接得更順暢。",
      },
      {
        toolSlug: "breastfeeding-rooms",
        caption: "出門前查哺集乳室",
        why: "產後哺乳期帶孩子外出時，公共場所是否有哺集乳室往往是決定行程的關鍵，這裡能查到全臺依法或自願設置的哺集乳室位置與開放時段。",
      },
      {
        toolSlug: "accessible-parking",
        caption: "找孕婦及親子專用車位",
        why: "懷孕後期行動不便、或帶著孩子與推車外出時，停車場與路邊停車的孕婦及親子專用車位能縮短步行距離並預留較寬的上下車空間；這裡能查到附近車位的即時剩餘數，出發前先確認有沒有空位。",
      },
      {
        toolSlug: "kindergartens",
        caption: "搜尋附近幼兒園",
        why: "孩子滿 2 歲後逐漸進入選擇幼兒園的階段，這裡收錄全國幼兒園資訊，方便依地區比較選擇。",
      },
      {
        toolSlug: "child-welfare-institutions",
        caption: "認識親子館與兒少福利中心",
        why: "除了幼兒園，各地親子館與兒少福利中心也提供免費的親子活動空間與育兒諮詢資源，是許多家庭還不知道、但其實很實用的公共資源。",
      },
      {
        toolSlug: "child-safety-spots",
        caption: "留意兒少安全警示地點",
        why: "孩子逐漸能獨立活動後，掌握社區內曾發布的婦幼安全警示地點，能幫助家長提前規劃孩子上下學或外出活動的安全路線。",
      },
    ],
    faqs: [
      {
        question: "母嬰親善醫院和一般醫院生產有什麼差別？",
        answer:
          "母嬰親善醫院經衛福部認證落實母嬰同室與母乳哺育支持措施，產後會提供更積極的哺乳指導與親子互動時間；一般醫院未必有此認證，但仍可提供基本生產與產後照護服務，可依自身需求與認證狀態選擇。",
      },
      {
        question: "哺集乳室地圖的資料多久更新？",
        answer:
          "資料整合自衛生福利部國民健康署官方開放資料，會定期同步，但部分場所的實際開放時段仍建議現場或電話再次確認，以免因臨時調整而白跑一趟。",
      },
      {
        question: "兒少安全警示地點會一直顯示嗎？",
        answer:
          "不會。警示公告只在生效期間（開始至結束時間內）顯示，超過結束時間即自動隱藏；若公告未標示結束時間，才會持續顯示直到另有公告更新。",
      },
    ],
  },
  {
    slug: "typhoon-earthquake",
    title: "颱風地震來了",
    description:
      "颱風、地震等天災發生前後，使用者最需要的是能快速串起示警、避難與生活支援的資訊。這份指南依「事前準備 → 事發應變 → 事後生活」的順序排列對應工具。",
    steps: [
      {
        toolSlug: "weather-alerts",
        caption: "關注氣象警報",
        why: "颱風、豪雨等天災多半有事前預警，持續關注即時氣象警報與降雨資訊，是應變準備最早能掌握的第一手資訊。",
      },
      {
        toolSlug: "earthquakes",
        caption: "查詢最新地震資訊",
        why: "地震無法提前預警，但地震發生後能立即查詢震央、規模、深度與海嘯警報，協助判斷後續是否需要進一步避難或防範餘震。",
      },
      {
        toolSlug: "disaster-map",
        caption: "確認最近的避難地圖",
        why: "天災發生時若住家或所在地有安全風險，防災避難地圖能協助使用者快速找到最近的避難收容處所與防災資源位置。",
      },
      {
        toolSlug: "metro-alerts",
        caption: "查詢交通是否停駛",
        why: "颱風或強震期間，捷運、輕軌、臺鐵與高鐵都可能因安全考量調整班次甚至全線停駛，前往避難處所或恢復日常通勤前，先查詢全台軌道營運通阻，避免白跑一趟或受困在半路。",
      },
      {
        toolSlug: "inundation-map",
        caption: "查看積淹水即時狀況",
        why: "豪雨或颱風期間，路面淹水與水位警戒是許多地區最直接的風險，即時感測地圖能協助判斷哪些路段應避免通行。",
      },
      {
        toolSlug: "water-outages",
        caption: "掌握停水與取水點",
        why: "災後常伴隨停水或管線修復，即時停水地圖能查到計畫停水範圍與替代取水點位置，避免生活用水突然中斷措手不及。",
      },
      {
        toolSlug: "emergency-supplies",
        caption: "準備防災物資",
        why: "事前依家戶人數計算應準備的緊急避難包與居家儲備物資數量，比災後再臨時採買更能確保關鍵時刻物資充足。",
      },
      {
        toolSlug: "emergency-hotlines",
        caption: "記下緊急電話",
        why: "天災應變的最後一道防線是能立即聯繫到對的單位，這裡整理了 110、119、112、1999 等全臺急用緊急專線，建議事先存入手機。",
      },
    ],
    faqs: [
      {
        question: "地震資料多快更新？",
        answer:
          "本站地震資料每 10 分鐘自動同步中央氣象署與美國地質調查局（USGS）的最新測報，在颱風或強震後的黃金應變時間內仍能參考到接近即時的資訊。",
      },
      {
        question: "防災物資要準備多少才夠？",
        answer:
          "緊急避難包與居家儲備物資計算機會依家戶人數（包含是否有嬰幼兒、長輩或寵物）估算建議準備數量，而非一體適用的固定清單，建議依工具試算結果調整。",
      },
      {
        question: "淹水警戒和停水查詢是同一個系統嗎？",
        answer:
          "不是，兩者資料來源不同：積淹水地圖整合路面淹水感測與水位防汛警戒資料，停水地圖則來自自來水公司的計畫停水與管線修復公告，建議天災期間兩者都查，掌握的風險面向不同。",
      },
    ],
  },
  {
    slug: "disability-living",
    title: "身心障礙者生活",
    description:
      "身心障礙者的生活資訊往往分散在福利、交通、無障礙設施等不同單位的網站，這份指南把申請福利、尋找就業機會到日常外出會用到的工具依序整理在一起。",
    steps: [
      {
        toolSlug: "disability-welfare",
        caption: "查詢身心障礙福利機構",
        why: "規劃身心障礙福利服務時，第一步通常是先確認住家附近有哪些提供照顧、訓練或日間服務的身心障礙福利機構。",
      },
      {
        toolSlug: "sheltered-workshops",
        caption: "了解庇護工場就業機會",
        why: "庇護工場是身心障礙者重要的就業與社會參與管道，這裡能查到各地庇護工場的位置與其身障手作商品，也方便使用者就近選購支持。",
      },
      {
        toolSlug: "disability-atm",
        caption: "找最近的無障礙 ATM",
        why: "金融服務的無障礙近用常被忽略，信用合作社無障礙 ATM 查詢能協助使用者找到設有無障礙設計的提款機，減少日常理財的障礙。",
      },
      {
        toolSlug: "audible-signals",
        caption: "確認路口是否有有聲號誌",
        why: "視障使用者獨立外出時，路口是否設有盲人有聲號誌（行人穿越道語音號誌）直接影響過街的安全性；這裡能查到全國各縣市已設置的路口，並標示該路口是否支援用手機 App 主動觸發語音播放，而非僅能在固定時段自動播放。",
      },
      {
        toolSlug: "accessible-parking",
        caption: "找身心障礙車位或復康巴士停車位",
        why: "開車或搭復康巴士外出時，停車場與路邊停車的身心障礙汽車、身心障礙機車與復康巴士專用車位往往一位難求；這裡能查到附近這些車位的即時剩餘數，避免到現場才發現已被占滿。",
      },
      {
        toolSlug: "accessible-transit",
        caption: "規劃無障礙交通",
        why: "外出交通是身心障礙者生活自立的關鍵，這裡整合了低地板公車、捷運無障礙設施、通用計程車與復康巴士資訊，方便事先規劃行程。",
      },
      {
        toolSlug: "public-toilets",
        caption: "確認公廁位置",
        why: "外出時公廁（尤其是無障礙廁所）的可及性直接影響行程安排，全國公廁查詢能在規劃路線時一併納入考量。",
      },
    ],
    faqs: [
      {
        question: "庇護工場的商品可以直接向工場購買嗎？",
        answer:
          "多數庇護工場都開放現場或電話洽詢購買其手作商品，實際購買方式與營業時間請以地圖上標示的各工場聯絡資訊為準。",
      },
      {
        question: "復康巴士需要事先預約嗎？",
        answer:
          "是的，復康巴士通常需要向所在縣市的復康巴士服務單位事先預約，各縣市的預約方式、資格與費用略有不同，建議透過無障礙交通地圖查詢所在地的服務單位後再行預約。",
      },
      {
        question: "無障礙 ATM 查詢只收錄信用合作社嗎？",
        answer:
          "目前本工具的資料來源為信用合作社無障礙 ATM 公開資料，收錄範圍以信用合作社為主；若需要其他金融機構的無障礙設施資訊，建議直接洽詢各銀行據點。",
      },
    ],
  },
  {
    slug: "travel-health",
    title: "出國與防疫",
    description:
      "出國前後最容易忽略的是疫情資訊與返國後的健康檢查，這份指南依「出國前查疫情 → 回國後顧健康 → 就醫用藥」的順序，整理使用者出國前後該查的工具。",
    steps: [
      {
        toolSlug: "travel-epidemic-alerts",
        caption: "出國前查旅遊疫情",
        why: "規劃出國行程前，先查詢目的地國家或地區的國際旅遊疫情與即時情報，了解是否有感染風險升高的地區，提早決定是否調整行程或加強防護。",
      },
      {
        toolSlug: "adult-preventive-care",
        caption: "回國後安排健檢",
        why: "從境外感染風險較高地區返國後，除了留意自身症狀，也適合利用成人健檢與公費癌症篩檢資源安排一次整體健康檢查，及早發現潛在問題。",
      },
      {
        toolSlug: "clinics",
        caption: "有不適時找診所",
        why: "若出國期間或返國後出現身體不適，可透過醫療院所查詢，依症狀快速找到附近的健保特約診所或醫院就醫，不需要從頭搜尋。",
      },
      {
        toolSlug: "pharmacies",
        caption: "領藥或補充旅行藥品",
        why: "就醫後領取連續處方箋或補充旅行常備藥品時，藥局查詢能協助找到附近的健保特約藥局，確認是否能調劑所需藥品。",
      },
    ],
    faqs: [
      {
        question: "旅遊疫情地圖的資料來源是什麼？",
        answer:
          "資料整合自疾病管制署等官方公布的國際旅遊疫情建議等級與即時情報，建議出國前再次確認最新公告，因疫情等級可能隨時調整。",
      },
      {
        question: "回國後一定要做健檢嗎？",
        answer:
          "並非強制，但若曾前往疫情等級較高地區，或返國後出現發燒、不適等症狀，建議儘早就醫並視情況安排檢查；成人健檢與公費癌症篩檢則是一般成人都可善用的定期健康管理資源，不限於旅遊返國後使用。",
      },
      {
        question: "連續處方箋可以在任何藥局領藥嗎？",
        answer:
          "需確認該藥局是否為健保特約藥局且提供連續處方箋調劑服務，本工具的藥局查詢結果會標示健保特約資格，建議先篩選再前往，避免白跑一趟。",
      },
    ],
  },
];

export interface GuideStepModel extends GuideStep {
  tool: ToolCatalogEntry;
  href: string;
}

export interface GuidePageModel {
  slug: string;
  title: string;
  description: string;
  steps: GuideStepModel[];
  faqs: ToolFaq[];
}

/**
 * Derives a `/guides/[slug]` hub page model from `GUIDES`: resolves each
 * step's `toolSlug` to its real `TOOL_CATALOG` entry (via
 * `getToolCatalogEntry`, which throws loudly on a typo'd slug rather than
 * silently rendering a blank card) and attaches the tool page's `href`.
 *
 * Returns `null` for an unknown guide slug, matching `buildCategoryPage`'s
 * "fail clearly, don't silently return empty data" convention.
 */
export function buildGuide(slug: string): GuidePageModel | null {
  const guide = GUIDES.find((g) => g.slug === slug);
  if (!guide) return null;

  return {
    slug: guide.slug,
    title: guide.title,
    description: guide.description,
    faqs: guide.faqs,
    steps: guide.steps.map((step) => ({
      ...step,
      tool: getToolCatalogEntry(step.toolSlug),
      href: `/tools/${step.toolSlug}`,
    })),
  };
}

export interface GuideLink {
  slug: string;
  title: string;
  href: string;
}

/**
 * Reverse lookup from a tool back to the life-situation guide(s) that
 * include it as a step (issue #465 acceptance criterion 5: "工具頁上線時能
 * 知道自己屬於哪些情境" — this ticket only prepares this data; rendering a
 * "所屬生活情境" section on the tool page itself is explicitly left to the
 * future tool-page-reorg ticket, per issue #438 §A).
 *
 * Derived straight from `GUIDES` — never a second, hand-maintained
 * tool-to-guides map — so it can't drift when a guide's steps change.
 * Returns `[]` for a tool that appears in no guide (most tools) or an
 * unrecognized slug; never throws.
 */
export function getGuidesForTool(toolSlug: string): GuideLink[] {
  return GUIDES.filter((guide) =>
    guide.steps.some((step) => step.toolSlug === toolSlug),
  ).map((guide) => ({
    slug: guide.slug,
    title: guide.title,
    href: `/guides/${guide.slug}`,
  }));
}
