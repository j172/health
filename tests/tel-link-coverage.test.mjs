import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Regression guard for the 2026-10-22 全站一致性掃描 (tel: link sweep): a
// handful of components displayed a real contact phone number (facility
// phone, water-utility customer-service line, anti-fraud hotline) as plain
// JSX text instead of a `tel:` link, unlike ~25 other files in this repo
// that already follow the `<a href={\`tel:${phone.replace(/[^0-9]/g, "")}\`}>`
// (or a literal `href="tel:1910"` for a known constant) convention. This
// file locks in the fix for every spot found during that sweep so a future
// edit can't silently drop the tel: wrapper.
//
// Design note / scope decision: a fully general "scan the whole repo for
// anything that looks like a Taiwan phone number and flag it if it's not
// inside a tel: link" guard was considered and rejected. Taiwan phone
// formats (0X-XXXXXXX, 0800-XXX-XXX, 09XX-XXX-XXX) are distinctive enough
// to regex for, but *short, undashed* codes (110, 119, 165, 1910, 1957,
// 1966, 1999, 1925...) are not — the same digit shapes collide with
// coordinates, dates, statute numbers, and plain prose numerals used
// throughout lib/server/tools/catalog.ts, lib/server/tools/navModel.ts,
// and various *Shared.ts "steps"/"FAQ" data arrays that render phone
// numbers embedded in long narrative sentences (not a discrete "here is
// the phone number" UI field). Teaching a global scanner the difference
// between "請撥打 165" (a real hotline mention) and "身障手冊第 165 條"
// would need real NLP, not a regex, and a wrong call either way is a
// worse outcome than catching one.
//
// So this guard is deliberately scoped two ways instead:
//   1. `findBareTaiwanPhoneNumbers` below *is* a general, regex-based
//      detector for the unambiguous dashed/segmented formats, proven
//      correct against positive and negative fixtures in the second test
//      — so the logic itself is real, not a placeholder.
//   2. The enforced regression test only runs it against the exact file
//      list this sweep touched (FIXED_FILES), rather than the whole repo,
//      to avoid false positives against unrelated numeric strings (IDs,
//      coordinates, zip codes, statute numbers) living in files this sweep
//      never looked at. Extending FIXED_FILES to a new file is a deliberate
//      choice for whoever touches that file next, not an automatic sweep.

const DASHED_PHONE_PATTERN = /\b(0800[-\s]?\d{3}[-\s]?\d{3}|09\d{2}[-\s]?\d{3}[-\s]?\d{3}|0\d{1,3}[-\s]?\d{3,4}[-\s]?\d{3,4})\b/g;

/**
 * Finds dashed/segmented Taiwan-phone-shaped substrings in `content` that
 * are NOT already wrapped in a `tel:` link. "Wrapped" means a `tel:` token
 * appears before the match, within WINDOW chars, with no intervening
 * `</a>` closing the anchor that opened it.
 */
const WINDOW = 250;

// Blanks out (same length, same line breaks) stretches of source that are
// never rendered as JSX text, so a phone-shaped number sitting in a code
// comment or a top-level `const NAME = "...";` data constant (whose actual
// *usage* elsewhere may be, and in every case we've found, is, wrapped in
// tel: through the constant's name rather than its literal value) doesn't
// get flagged. This mirrors a real false positive hit during development:
// FacilitySearchContent.tsx's `const ADDICTION_HOTLINE = "0800-770-885";`
// and a JSDoc comment one line above it mentioning a superseded number.
function blankOut(src, pattern) {
  return src.replace(pattern, (m) => m.replace(/[^\n]/g, " "));
}

function sanitizeForPhoneScan(src) {
  let out = blankOut(src, /\/\*[\s\S]*?\*\//g); // block comments
  out = blankOut(out, /\/\/.*$/gm); // line comments
  out = blankOut(out, /\bconst\s+[A-Z][A-Z0-9_]*\s*=\s*"[^"]*"\s*;/g); // SCREAMING_CASE data constants
  return out;
}

export function findBareTaiwanPhoneNumbers(content, filePath = "") {
  const sanitized = sanitizeForPhoneScan(content);
  const violations = [];
  let match;
  DASHED_PHONE_PATTERN.lastIndex = 0;
  while ((match = DASHED_PHONE_PATTERN.exec(sanitized))) {
    const windowStart = Math.max(0, match.index - WINDOW);
    const before = sanitized.slice(windowStart, match.index);

    const telIdx = before.lastIndexOf("tel:");
    const closeAnchorIdx = before.lastIndexOf("</a>");
    const isWrapped = telIdx !== -1 && telIdx > closeAnchorIdx;
    if (isWrapped) continue;

    const line = content.slice(0, match.index).split("\n").length;
    violations.push({ file: filePath, line, match: match[0] });
  }
  return violations;
}

test("Regression Guard detection unit tests: findBareTaiwanPhoneNumbers distinguishes wrapped vs bare phone numbers", () => {
  // Flagged: plain text, no tel: anywhere near it.
  assert.equal(
    findBareTaiwanPhoneNumbers(`<p>客服專線: 台水 1910 / 北水 02-8733-5678</p>`, "t.tsx").length,
    1, // "1910" is a short code (out of this detector's scope); only the dashed "02-8733-5678" is caught
  );

  // Flagged: toll-free number in plain text.
  assert.equal(findBareTaiwanPhoneNumbers(`<p>撥打 0800-770-885 洽詢</p>`, "t.tsx").length, 1);

  // Flagged: mobile-format number in plain text.
  assert.equal(findBareTaiwanPhoneNumbers(`<p>簡訊請傳 0911-511-110</p>`, "t.tsx").length, 1);

  // Not flagged: literal tel: href immediately before the display text.
  assert.deepEqual(
    findBareTaiwanPhoneNumbers(`<a href="tel:0287335678">02-8733-5678</a>`, "t.tsx"),
    [],
  );

  // Not flagged: dynamic tel: href built from the same field just displayed
  // (the literal digits stand in for the `{f.phone}` interpolation here,
  // since the detector works on rendered text, not a JSX AST).
  assert.deepEqual(
    findBareTaiwanPhoneNumbers(
      '<a href={`tel:${f.phone.replace(/[^0-9]/g, "")}`}>02-8733-5678</a>',
      "t.tsx",
    ),
    [],
  );

  // Not flagged: a code comment mentioning a superseded/historical number,
  // and a SCREAMING_CASE data constant's own literal value (its usage
  // elsewhere is wrapped via the constant's *name*, which this scan can't
  // see — documented limitation, see sanitizeForPhoneScan above).
  assert.deepEqual(
    findBareTaiwanPhoneNumbers(
      '/**\n * 號碼修正：從誤植的 0800-024-555 改成這支\n */\nconst ADDICTION_HOTLINE = "0800-770-885";',
      "t.tsx",
    ),
    [],
  );

  // Flagged again: a *second*, unrelated bare number after a closing </a>
  // must not be treated as wrapped just because an earlier tel: link exists.
  const twoNumbersOneWrapped = `<a href="tel:0287335678">02-8733-5678</a> 另外也可以打 04-1234567 試試`;
  const violations = findBareTaiwanPhoneNumbers(twoNumbersOneWrapped, "t.tsx");
  assert.equal(violations.length, 1);
  assert.equal(violations[0].match.replace(/\s/g, ""), "04-1234567");

  // Not flagged: a non-phone numeric id/date-shaped string the pattern
  // simply doesn't match (sanity check that this isn't over-eager).
  assert.deepEqual(findBareTaiwanPhoneNumbers(`<p>版本 1.0800.3</p>`, "t.tsx"), []);
});

// Conservative, scoped guard (see design note above): only the files this
// 2026-10-22 sweep actually fixed. Each entry previously had at least one
// bare (non-tel:) Taiwan-phone-shaped string; this locks in that it stays
// wrapped.
const FIXED_FILES = [
  "components/WaterOutages/WaterOutagesContent.tsx",
  "components/WaterOutages/WaterQualityTab.tsx",
  "components/WaterOutages/WaterPlantQualitySection.tsx",
  "components/Tools/AedContent.tsx",
  "components/Tools/AedMapLeaflet.tsx",
  "components/Facilities/FacilitySearchContent.tsx",
  "components/Facilities/FacilityMap.tsx",
  "components/Tools/EmergencyRoomContent.tsx",
];

test("Regression Guard: files fixed by the 2026-10-22 tel: link sweep have no remaining bare dashed phone numbers", () => {
  const rootDir = process.cwd();
  const allViolations = [];

  for (const relPath of FIXED_FILES) {
    const fullPath = path.join(rootDir, relPath);
    assert.ok(fs.existsSync(fullPath), `Expected ${relPath} to exist`);
    const content = fs.readFileSync(fullPath, "utf-8");
    allViolations.push(...findBareTaiwanPhoneNumbers(content, relPath));
  }

  if (allViolations.length > 0) {
    const details = allViolations.map((v) => `  - ${v.file}:${v.line} -> ${v.match}`).join("\n");
    assert.fail(`Found bare (non-tel:) Taiwan-phone-shaped string(s):\n${details}`);
  }

  assert.equal(allViolations.length, 0);
});

// Structural guards — same spirit as outbound-link-coverage.test.mjs's
// "Structural Guard" tests: assert the exact tel: pattern landed, not just
// "no bare number remains" (which the test above already covers).
test("Structural Guard: WaterOutagesContent.tsx wraps the water-utility hotline and station contact numbers", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "components/WaterOutages/WaterOutagesContent.tsx"),
    "utf-8",
  );
  assert.match(content, /href="tel:1910"/);
  assert.match(content, /href=\{`tel:\$\{station\.contactPhone\.replace\(\/\[\^0-9\]\/g, ""\)\}`\}/);
});

test("Structural Guard: WaterQualityTab.tsx and WaterPlantQualitySection.tsx wrap the 1910 customer-service mention", () => {
  const qualityTab = fs.readFileSync(
    path.join(process.cwd(), "components/WaterOutages/WaterQualityTab.tsx"),
    "utf-8",
  );
  assert.match(qualityTab, /href="tel:1910"/);

  const plantSection = fs.readFileSync(
    path.join(process.cwd(), "components/WaterOutages/WaterPlantQualitySection.tsx"),
    "utf-8",
  );
  assert.match(plantSection, /href="tel:1910"/);
});

test("Structural Guard: AedContent.tsx, AedMapLeaflet.tsx, FacilitySearchContent.tsx, FacilityMap.tsx, EmergencyRoomContent.tsx wrap their phone-field display with tel:", () => {
  const cases = [
    { file: "components/Tools/AedContent.tsx", pattern: /href=\{`tel:\$\{item\.phone\.replace\(\/\[\^0-9\]\/g, ""\)\}`\}/ },
    { file: "components/Tools/AedMapLeaflet.tsx", pattern: /href=\{`tel:\$\{item\.phone\.replace\(\/\[\^0-9\]\/g, ""\)\}`\}/ },
    { file: "components/Facilities/FacilitySearchContent.tsx", pattern: /href=\{`tel:\$\{f\.phone\.replace\(\/\[\^0-9\]\/g, ""\)\}`\}/ },
    { file: "components/Facilities/FacilityMap.tsx", pattern: /href=\{`tel:\$\{m\.phone\.replace\(\/\[\^0-9\]\/g, ""\)\}`\}/ },
    { file: "components/Tools/EmergencyRoomContent.tsx", pattern: /href=\{`tel:\$\{hospital\.phone\.replace\(\/\[\^0-9\]\/g, ""\)\}`\}/ },
  ];
  for (const { file, pattern } of cases) {
    const content = fs.readFileSync(path.join(process.cwd(), file), "utf-8");
    assert.match(content, pattern, `${file} should wrap its phone field with tel:`);
  }
});

test("Structural Guard: AntiFraudChecker.tsx wraps the 165 anti-fraud hotline mentions with tel:165", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "app/(zh)/tools/anti-fraud/AntiFraudChecker.tsx"),
    "utf-8",
  );
  const occurrences = content.match(/href="tel:165"/g) || [];
  assert.ok(occurrences.length >= 3, `Expected at least 3 tel:165 links, found ${occurrences.length}`);
});
