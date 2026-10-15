import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Regression guard for issue #451 ("全站外部連結補齊 UTM 追蹤參數"): any
// hardcoded href pointing at an external (站外) domain must be routed
// through appendOutboundUtm() so it carries utm_source/utm_medium. A future
// PR that pastes a new partner/attribution/app-store link in directly as a
// plain string literal, without wrapping it, should fail this test.
//
// Scope and known limitations (documented on purpose, same spirit as
// tests/no-hardcoded-tile-subdomain.test.mjs's pragmatic regex-based guard —
// this is a source-text scanner, not a full AST/dataflow analysis):
//   - The literal-URL scanner below (findUnwrappedExternalHrefs) only flags
//     hrefs where a literal `https://`/`http://` string appears directly
//     inside the `href=` attribute's own value (a plain string, or a
//     template literal, optionally behind a `foo || "https://..."`
//     fallback). It cannot see a dynamic per-record URL
//     (`href={item.website}`, `href={ref.url}`), which is what the second
//     scanner (findUnwrappedDynamicExternalHrefs, PRD #438 §M / 接縫 ②)
//     covers: a dynamic href is treated as external when its own tag carries
//     target="_blank" / rel="noopener|noreferrer", or its value reads a
//     URL-ish property (`.url`, `.web`, `.website`, `.link`, `*Url`). Such an
//     href must go through appendOutboundUtm()/buildOutboundLink(), or be
//     listed in DYNAMIC_HREF_ALLOWLIST with a reason. The detection is a
//     heuristic, not dataflow analysis: a dynamic href to an external site
//     that has neither signal (no target/rel, non-URL-ish name) is invisible
//     to it, so name such props `*Url` / use target="_blank" like the rest of
//     the repo does.
//   - mailto: / tel: hrefs never contain "https://" so they're naturally
//     excluded.
//   - A link to this site's own domain (health.j172.tw) is not "站外" and is
//     excluded.

function getAllSourceFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllSourceFiles(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

const OWN_HOSTS = new Set([
  "health.j172.tw",
  // XML/XHTML namespace URIs that show up in inline <svg> markup near a real
  // href — never a clickable link target.
  "www.w3.org",
]);
// Only match JSX/HTML attribute syntax (`href="..."`, `href={...}`), not a
// plain JS variable assignment like `const href = $(el).attr("href")`, and
// not a single-quoted `href='...'` inside a regex/string literal parsing an
// onclick handler — this codebase's JSX always uses double quotes or `{}`,
// never single quotes, so requiring one of those immediately after `href=`
// keeps the cheerio-based RSS/ingestion scrapers under lib/server/ (which
// are server-side parsing code, never a rendered link) out of scope.
const HREF_PATTERN = /href\s*=\s*(?=["`{])/g;
const URL_PATTERN = /https?:\/\/([a-zA-Z0-9.-]+)/;
const WRAP_TOKEN = "appendOutboundUtm(";
// How far forward from each `href=` token to look for a literal URL. All of
// this repo's hrefs (including the longest multi-line template-literal +
// encodeURIComponent cases) fit comfortably inside this window; it's wide
// enough to span a wrapped call's opening but anchored at `href=` so it can
// never swallow a *different* element's unrelated href/wrap. The window is
// additionally cut short at the first `<` (start of a sibling/child JSX
// element) since a real URL never contains a literal `<` — this keeps a
// short attribute value (e.g. `href={sourceUrl}` with nothing else to find)
// from accidentally reaching into unrelated markup further down the file
// (an inline <svg>'s xmlns, a later sibling <a>, etc.).
const WINDOW_SIZE = 600;

export function findUnwrappedExternalHrefs(fileContent, filePath = "") {
  const violations = [];
  let match;
  HREF_PATTERN.lastIndex = 0;
  while ((match = HREF_PATTERN.exec(fileContent))) {
    let windowText = fileContent.slice(
      match.index,
      match.index + WINDOW_SIZE,
    );
    const nextTagIdx = windowText.indexOf("<");
    if (nextTagIdx !== -1) {
      windowText = windowText.slice(0, nextTagIdx);
    }
    const urlMatch = windowText.match(URL_PATTERN);
    if (!urlMatch) continue; // bare-identifier href, or no URL at all in range — out of scope, see header comment

    const host = urlMatch[1];
    if (OWN_HOSTS.has(host)) continue; // internal self-link, not 站外

    const idxUrl = urlMatch.index;
    const idxWrap = windowText.indexOf(WRAP_TOKEN);
    const isWrapped = idxWrap !== -1 && idxWrap < idxUrl;
    if (isWrapped) continue;

    const line = fileContent.slice(0, match.index).split("\n").length;
    violations.push({
      file: filePath,
      line,
      code: windowText.split("\n")[0].trim(),
    });
  }
  return violations;
}

test("Regression Guard: no source file hardcodes an unwrapped href to an external domain", () => {
  const rootDir = process.cwd();
  const sourceDirs = ["app", "components", "lib"].map((dir) => path.join(rootDir, dir));

  const files = sourceDirs.flatMap((dir) => getAllSourceFiles(dir));
  assert.ok(files.length > 20, `Expected multiple source files, found ${files.length}`);

  const allViolations = [];

  for (const file of files) {
    if (path.basename(file) === "outbound-link-coverage.test.mjs") continue;
    const content = fs.readFileSync(file, "utf-8");
    const relPath = path.relative(rootDir, file).replace(/\\/g, "/");
    const violations = findUnwrappedExternalHrefs(content, relPath);
    if (violations.length > 0) {
      allViolations.push(...violations);
    }
  }

  if (allViolations.length > 0) {
    const errorDetails = allViolations
      .map((v) => `  - ${v.file}:${v.line} -> ${v.code}`)
      .join("\n");
    assert.fail(
      `Found hardcoded href(s) to an external domain not wrapped in appendOutboundUtm() (issue #451):\n${errorDetails}\nWrap with appendOutboundUtm() from '@/lib/format/outboundLink', e.g. href={appendOutboundUtm("https://...", { medium: "..." })}.`
    );
  }

  assert.equal(allViolations.length, 0);
});

test("Regression Guard detection unit tests: correctly distinguishes wrapped vs unwrapped external hrefs", () => {
  const unwrappedLiteral = `<a href="https://example.com/partner">link</a>`;
  assert.equal(findUnwrappedExternalHrefs(unwrappedLiteral, "test.tsx").length, 1);

  const unwrappedTemplate = `<a href={\`https://example.com/maps?q=\${lat},\${lng}\`}>link</a>`;
  assert.equal(findUnwrappedExternalHrefs(unwrappedTemplate, "test.tsx").length, 1);

  const unwrappedFallback = `<a href={item.web || "https://www.cdc.gov.tw"}>link</a>`;
  assert.equal(findUnwrappedExternalHrefs(unwrappedFallback, "test.tsx").length, 1);

  const wrappedLiteral = `<a href={appendOutboundUtm("https://example.com/partner", { medium: "x" })}>link</a>`;
  assert.deepEqual(findUnwrappedExternalHrefs(wrappedLiteral, "test.tsx"), []);

  const wrappedFallback = `<a href={appendOutboundUtm(item.web || "https://www.cdc.gov.tw", { medium: "x" })}>link</a>`;
  assert.deepEqual(findUnwrappedExternalHrefs(wrappedFallback, "test.tsx"), []);

  const bareIdentifier = `<a href={item.website}>link</a>`;
  assert.deepEqual(findUnwrappedExternalHrefs(bareIdentifier, "test.tsx"), []);

  const internalSelfLink = `<a href="https://health.j172.tw/tools/aed">link</a>`;
  assert.deepEqual(findUnwrappedExternalHrefs(internalSelfLink, "test.tsx"), []);

  const mailtoLink = `<a href="mailto:contact@j172.tw">mail</a>`;
  assert.deepEqual(findUnwrappedExternalHrefs(mailtoLink, "test.tsx"), []);

  const twoSiblingHrefsOneUnwrapped = `
    <a href="https://example.com/unwrapped">a</a>
    <a href={appendOutboundUtm("https://example.com/wrapped", { medium: "x" })}>b</a>
  `;
  const siblingViolations = findUnwrappedExternalHrefs(twoSiblingHrefsOneUnwrapped, "test.tsx");
  assert.equal(siblingViolations.length, 1);
  assert.ok(siblingViolations[0].code.includes("unwrapped"));
});

test("Structural Guard: scientificBasis citations (lib/server/tools/catalog.ts, ~139 links) are UTM-wrapped at render time in ToolPageShell", () => {
  const rootDir = process.cwd();
  const shellPath = path.join(rootDir, "components", "Tools", "ToolPageShell.tsx");
  const content = fs.readFileSync(shellPath, "utf-8");

  assert.ok(
    content.includes('from "@/lib/format/outboundLink"'),
    "ToolPageShell.tsx must import appendOutboundUtm",
  );
  assert.match(
    content,
    /href=\{appendOutboundUtm\(ref\.url/,
    "ToolPageShell.tsx must wrap each scientificBasis ref.url with appendOutboundUtm at render time",
  );
});

test("Structural Guard: news hero stock-photo attribution link is UTM-wrapped", () => {
  const rootDir = process.cwd();
  const heroPath = path.join(rootDir, "components", "News", "HeroImage.tsx");
  const content = fs.readFileSync(heroPath, "utf-8");

  assert.ok(content.includes('from "@/lib/format/outboundLink"'));
  assert.match(content, /href=\{appendOutboundUtm\(attribution\.sourcePageUrl/);
});

test("Structural Guard: shared map attribution and Google Maps navigation constants are UTM-wrapped at their single choke point", () => {
  const rootDir = process.cwd();

  const mapTiles = fs.readFileSync(
    path.join(rootDir, "lib", "constants", "mapTiles.ts"),
    "utf-8",
  );
  assert.ok(mapTiles.includes(WRAP_TOKEN), "lib/constants/mapTiles.ts must wrap OSM_TILE_ATTRIBUTION's link");

  const tileConfig = fs.readFileSync(
    path.join(rootDir, "components", "Map", "tileConfig.ts"),
    "utf-8",
  );
  assert.ok(tileConfig.includes(WRAP_TOKEN), "components/Map/tileConfig.ts must wrap FALLBACK_ATTRIBUTION's link");

  const mapNavigation = fs.readFileSync(
    path.join(rootDir, "lib", "utils", "mapNavigation.ts"),
    "utf-8",
  );
  assert.ok(
    mapNavigation.includes(WRAP_TOKEN),
    "lib/utils/mapNavigation.ts's buildGoogleMapsDirUrl (13+ importers) must wrap its returned URL",
  );
});

// ---------------------------------------------------------------------------
// Dynamic hrefs (PRD #438 §M, 接縫 ②): `href={item.website}`, `href={ref.url}`
// and HTML-string popups (`<a href="${escapeHtml(props.url)}">`).
//
// The literal-URL scanner above cannot see these, so this second scanner
// extracts each dynamic href expression plus its enclosing opening tag and
// decides whether it points off-site from two cheap signals (no dataflow):
//   1. the tag carries target="_blank" or rel="…noopener|noreferrer…" — this
//      repo only puts those on external links; or
//   2. the expression reads a URL-ish property (`.url`, `.web`, `.website`,
//      `.link`, `*Url`, `*_url`) — function calls like `buildUrl(…)` are not.
// An external-looking dynamic href passes only if it is wrapped by one of the
// UTM builders below (inline, or by the `const x = appendOutboundUtm(…)`
// declaration it references), or is listed in DYNAMIC_HREF_ALLOWLIST with a
// reason. Allowlist entries are keyed by file + normalized expression (never a
// line number, so unrelated edits can't make the test flaky) and a stale entry
// fails the test so the list can't rot.
// ---------------------------------------------------------------------------

// Helpers that attach utm_source=health.j172.tw themselves. buildGoogleMapsDirUrl
// wraps its return value at its single choke point (see the structural guard
// above); the other two are the outboundLink.ts helpers.
const UTM_WRAPPERS = [
  "appendOutboundUtm(",
  "buildOutboundLink(",
  "buildGoogleMapsDirUrl(",
];

const DYNAMIC_HREF_ALLOWLIST = [
  {
    file: "components/Common/ContextualPartnerCard.tsx",
    expr: "targetUrl",
    reason:
      "built by buildContextualPartnerUrl(), which injects the same utm_source=health.j172.tw (+ contextual_banner / civic_partner) and respects upstream UTM; covered by lib/constants/contextualPartners.test.mjs",
  },
  {
    file: "components/Common/OutRedirectCountdown.tsx",
    expr: "targetUrl",
    reason:
      "the /out interstitial's fallback link; app/(zh)/(site)/out/page.tsx already passes validateOutboundUrl() output through appendOutboundUtm() before handing it over",
  },
  {
    file: "components/News/SiteFooter.tsx",
    expr: "href",
    reason:
      "FooterExternalLink / SocialIcon are pass-through wrappers; every caller already supplies an appendOutboundUtm()-wrapped value (civic-partner links from lib/server/tools/navModel.ts, social icons wrapped at their call sites)",
  },
  {
    file: "app/(zh)/accessibility/page.tsx",
    expr: "ACCESSIBILITY_FEEDBACK_LINKS[1].url",
    reason: "a mailto: link; appending ?utm_* to a mailto: URL would corrupt it",
  },
];

// `.url` / `.web` / `.website` / `.link` / `.fooUrl` / `.foo_url` (not a call), or
// an expression that is just such a bare identifier (`promoUrl`, `targetUrl`).
// Deliberately not a substring match: `escapeXml(`${baseUrl}/feed.xml`)` and
// `buildUrl(1, size)` mention "Url" but are internal.
const URLISH_NAME =
  /\.(?:\w*Url|\w*_url|url|web|website|link)\b(?!\s*\()|^(?:\w*Url|\w*_url|url|web|website|link)!?$/i;
const EXTERNAL_TAG_SIGNAL =
  /\btarget\s*=\s*(?:"_blank"|\{\s*["'`]_blank["'`]|'_blank')|\brel\s*=\s*(?:"[^"]*|\{[^}]*)(?:noopener|noreferrer)/;

function skipString(src, i) {
  const quote = src[i];
  i += 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (quote === "`" && ch === "$" && src[i + 1] === "{") {
      i = skipBraces(src, i + 1);
      continue;
    }
    if (ch === quote) return i + 1;
    i += 1;
  }
  return i;
}

// src[i] must be "{"; returns the index just past the matching "}".
function skipBraces(src, i) {
  let depth = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(src, i);
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return i;
}

// The opening tag (`<a …>`) that contains `hrefIdx`, or "" if it can't be found.
function enclosingOpeningTag(src, hrefIdx) {
  let start = hrefIdx;
  while (start >= 0) {
    start = src.lastIndexOf("<", start);
    if (start === -1) return "";
    if (/[A-Za-z]/.test(src[start + 1] ?? "")) break;
    start -= 1;
  }
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      i = skipString(src, i);
      continue;
    }
    if (ch === "{") {
      i = skipBraces(src, i);
      continue;
    }
    if (ch === ">") return i > hrefIdx ? src.slice(start, i + 1) : "";
    i += 1;
  }
  return "";
}

const normalizeExpr = (expr) => expr.replace(/\s+/g, " ").trim();
const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;
const hasWrapper = (text) => UTM_WRAPPERS.some((token) => text.includes(token));

function isWrappedByLocalDeclaration(src, identifier) {
  if (!/^[A-Za-z_$][\w$]*$/.test(identifier)) return false;
  const declaration = new RegExp(
    `\\b(?:const|let)\\s+${identifier.replace(/\$/g, "\\$")}\\b[^=;]*=([^;]*)`,
  );
  const match = src.match(declaration);
  return Boolean(match && hasWrapper(match[1]));
}

export function findUnwrappedDynamicExternalHrefs(fileContent, filePath = "") {
  const violations = [];

  // (a) JSX: href={ expression }
  const jsxPattern = /\bhref\s*=\s*\{/g;
  let match;
  while ((match = jsxPattern.exec(fileContent))) {
    const openIdx = match.index + match[0].length - 1;
    const end = skipBraces(fileContent, openIdx);
    const expr = normalizeExpr(fileContent.slice(openIdx + 1, end - 1));
    // A literal-led value (`"/x"`, `` `/news/${id}` ``, `"https://…"`) names its
    // destination in source; the literal-URL scanner owns the external ones.
    if (!expr || /^["'`]/.test(expr)) continue;

    const tag = enclosingOpeningTag(fileContent, match.index);
    const looksExternal = EXTERNAL_TAG_SIGNAL.test(tag) || URLISH_NAME.test(expr);
    if (!looksExternal) continue;
    if (hasWrapper(expr) || isWrappedByLocalDeclaration(fileContent, expr)) continue;

    violations.push({
      file: filePath,
      line: lineOf(fileContent, match.index),
      expr,
      code: `href={${expr}}`,
    });
  }

  // (b) HTML strings: <a href="${ expression }" …>
  const htmlPattern = /\bhref=\\?(["'])\$\{/g;
  while ((match = htmlPattern.exec(fileContent))) {
    const openIdx = match.index + match[0].length - 1;
    const end = skipBraces(fileContent, openIdx);
    const expr = normalizeExpr(fileContent.slice(openIdx + 1, end - 1));
    const tagEnd = fileContent.indexOf(">", end);
    const tag = fileContent.slice(match.index, tagEnd === -1 ? end : tagEnd);

    const looksExternal = EXTERNAL_TAG_SIGNAL.test(tag) || URLISH_NAME.test(expr);
    if (!looksExternal) continue;
    if (hasWrapper(expr)) continue;
    // A module-level SCREAMING_CASE constant in a file that builds its URLs with
    // appendOutboundUtm() (tile attribution links) is wrapped at its definition.
    if (/^[A-Z][A-Z0-9_]*$/.test(expr) && fileContent.includes("appendOutboundUtm(")) continue;

    violations.push({
      file: filePath,
      line: lineOf(fileContent, match.index),
      expr,
      code: `href="\${${expr}}"`,
    });
  }

  return violations;
}

const isAllowlisted = (violation) =>
  DYNAMIC_HREF_ALLOWLIST.find(
    (entry) => entry.file === violation.file && entry.expr === violation.expr,
  );

test("Regression Guard: no dynamic external href bypasses appendOutboundUtm() (PRD #438 §M)", () => {
  const rootDir = process.cwd();
  const sourceDirs = ["app", "components", "lib"].map((dir) => path.join(rootDir, dir));
  const files = sourceDirs.flatMap((dir) => getAllSourceFiles(dir));
  assert.ok(files.length > 20, `Expected multiple source files, found ${files.length}`);

  const used = new Set();
  const offenders = [];

  for (const file of files) {
    if (path.basename(file) === "outbound-link-coverage.test.mjs") continue;
    const content = fs.readFileSync(file, "utf-8");
    // Cheap pre-filter keeps the scan fast: no `href` token, nothing to inspect.
    if (!content.includes("href")) continue;
    const relPath = path.relative(rootDir, file).replace(/\\/g, "/");
    for (const violation of findUnwrappedDynamicExternalHrefs(content, relPath)) {
      const entry = isAllowlisted(violation);
      if (entry) used.add(entry);
      else offenders.push(violation);
    }
  }

  if (offenders.length > 0) {
    const details = offenders.map((v) => `  - ${v.file}:${v.line} -> ${v.code}`).join("\n");
    assert.fail(
      `Found dynamic external href(s) not routed through a UTM helper (PRD #438 §M):\n${details}\nWrap with appendOutboundUtm() from '@/lib/format/outboundLink', e.g. href={appendOutboundUtm(item.url, { medium: "tool_outbound", campaign: "<tool_slug>" })}, or add a DYNAMIC_HREF_ALLOWLIST entry with a reason (e.g. mailto:).`,
    );
  }

  const stale = DYNAMIC_HREF_ALLOWLIST.filter((entry) => !used.has(entry));
  assert.deepEqual(
    stale.map((entry) => `${entry.file} :: ${entry.expr}`),
    [],
    "Stale DYNAMIC_HREF_ALLOWLIST entries — the href no longer exists or is now wrapped; remove them.",
  );
  for (const entry of DYNAMIC_HREF_ALLOWLIST) {
    assert.ok(entry.reason && entry.reason.length > 10, `Allowlist entry for ${entry.file} needs a reason`);
  }
});

test("Regression Guard detection unit tests: dynamic external hrefs", () => {
  const scan = (src) => findUnwrappedDynamicExternalHrefs(src, "test.tsx");

  // Flagged: bare URL-ish property, with and without target/rel.
  assert.equal(scan(`<a href={item.website} target="_blank" rel="noopener noreferrer">x</a>`).length, 1);
  assert.equal(scan(`<a href={item.url}>x</a>`).length, 1);
  assert.equal(scan(`<a href={m.mapUrl!}>x</a>`).length, 1);
  assert.equal(scan(`<a href={item.web || fallback}>x</a>`).length, 1);
  // Flagged: non-URL-ish name, but the tag opens a new tab (external marker).
  assert.equal(scan(`<a href={step.href} target="_blank" rel="noopener noreferrer">x</a>`).length, 1);
  assert.equal(scan(`<a\n  className="a>b"\n  href={step.href}\n  rel="noreferrer noopener"\n>x</a>`).length, 1);
  // Flagged: HTML-string popup.
  assert.equal(
    scan("const h = `<a href=\"${escapeHtml(properties.url)}\" target=\"_blank\">x</a>`;").length,
    1,
  );

  // Not flagged: wrapped inline (also across lines and behind a fallback).
  assert.deepEqual(scan(`<a href={appendOutboundUtm(item.website, { medium: "tool_outbound" })} target="_blank">x</a>`), []);
  assert.deepEqual(scan(`<a href={appendOutboundUtm(\n  item.web || "https://x.tw",\n  { medium: "m" },\n)}>x</a>`), []);
  assert.deepEqual(scan(`<a href={buildOutboundLink(item.url)}>x</a>`), []);
  assert.deepEqual(scan(`<a href={buildGoogleMapsDirUrl({ name: n })} target="_blank">x</a>`), []);
  assert.deepEqual(
    scan("const h = `<a href=\"${escapeHtml(appendOutboundUtm(properties.url, { medium: \"m\" }))}\" target=\"_blank\">x</a>`;"),
    [],
  );
  // Not flagged: wrapped via the local declaration the href references.
  assert.deepEqual(
    scan(`const sourceUrl = appendOutboundUtm("https://g.co", { medium: "m" });\n<a href={sourceUrl} target="_blank">x</a>`),
    [],
  );
  // Flagged: a same-named local that is NOT wrapped.
  assert.equal(scan(`const sourceUrl = compute();\n<a href={sourceUrl} target="_blank">x</a>`).length, 1);
  // Not flagged: internal navigation and non-URL-ish builders.
  assert.deepEqual(scan(`<Link href={item.href}>x</Link>`), []);
  assert.deepEqual(scan(`<Link href={buildUrl(1, size)}>x</Link>`), []);
  assert.deepEqual(scan(`<Link href={\`/news/\${id}\`}>x</Link>`), []);
  assert.deepEqual(scan(`<Link href={buildLocalizedPath(item.path, locale)}>x</Link>`), []);
  // Not flagged: literal-led values belong to the literal-URL scanner.
  assert.deepEqual(scan(`<a href={"https://example.com"} target="_blank">x</a>`), []);
  // Not flagged: HTML string pointing at a wrapped module constant / an internal URL.
  assert.deepEqual(
    scan("const U = appendOutboundUtm(\"https://o.org\");\nconst a = `<a href=\"${U}\" target=\"_blank\">x</a>`;"),
    [],
  );
  assert.deepEqual(scan("const a = `<atom:link href=\"${escapeXml(`${baseUrl}/feed.xml`)}\" rel=\"self\" />`;"), []);
  // Allowlist keys are normalized expressions, independent of line breaks.
  assert.equal(scan(`<a href={\n  item.url\n}>x</a>`)[0].expr, "item.url");
});
