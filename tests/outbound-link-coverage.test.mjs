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
//   - Only flags hrefs where a literal `https://`/`http://` string appears
//     directly inside the `href=` attribute's own value (a plain string, or
//     a template literal, optionally behind a `foo || "https://..."`
//     fallback). A bare-identifier href (`href={item.website}`,
//     `href={ref.url}`) can't be judged by scanning source text alone —
//     those are dynamic per-record URLs (NPO/charity/hospital/product data
//     from the DB) or values already wrapped one level removed (see the
//     dedicated structural tests below for the specific choke points of
//     that kind this repo has: ToolPageShell's scientificBasis citations,
//     HeroImage's stock-photo attribution, the shared Google Maps/tile
//     constants). This is intentionally the same boundary the acceptance
//     criteria draws when it excludes "infrastructure-only" / non-clickable
//     strings — a dynamic record URL with no literal domain in source isn't
//     something this guard can see, so it's out of scope here by
//     construction, not by an allowlist.
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
