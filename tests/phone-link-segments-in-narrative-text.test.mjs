import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

// Regression + structural guard for the "narrative text embeds a phone
// number, make it clickable" rewrite: `lib/types/textWithPhoneLinks.ts`
// (the shared `TextWithPhoneLinks` type + `plainTextOf`/`isPhoneLinkSegment`
// helpers) and `components/Common/TextWithPhoneLinks.tsx` (the shared
// renderer) let a `string[]`/`string` content field keep plain strings for
// every item that has no phone number, and become a segment array only for
// the sentence that actually names one.
//
// `lib/types/textWithPhoneLinks.ts` is plain TS (no JSX), so it's imported
// and exercised directly. The four content files this rewrite touched are
// all real JSX components — Node's native TS-stripping loader can't parse
// JSX, and this repo has no DOM/render harness (see
// tests/social-welfare-centers-603.test.mjs's note on the same limitation)
// — so each one's data array is extracted from its own raw source text
// (balanced-bracket slice, no regex guessing) and evaluated as a plain JS
// literal, then walked with the real `plainTextOf` to assert that no
// wording was lost and that every phone segment's `tel` is correct.

const { plainTextOf, isPhoneLinkSegment } = await import("../lib/types/textWithPhoneLinks.ts");

test("lib/types/textWithPhoneLinks: plainTextOf and isPhoneLinkSegment", () => {
  assert.equal(plainTextOf("plain string, no phone"), "plain string, no phone");
  assert.equal(
    plainTextOf([{ text: "撥打 " }, { tel: "165", text: "165" }, { text: " 查證" }]),
    "撥打 165 查證",
  );
  assert.equal(isPhoneLinkSegment({ text: "x" }), false);
  assert.equal(isPhoneLinkSegment({ tel: "110", text: "110" }), true);
});

/** Slices `text` from `startIdx` (which must point at `openChar`) to its matching `closeChar`, skipping bracket-looking characters inside string literals. */
function sliceBalanced(text, startIdx, openChar, closeChar) {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  for (let i = startIdx; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") {
        i++; // skip the escaped character
        continue;
      }
      if (c === stringChar) inString = false;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = true;
      stringChar = c;
      continue;
    }
    if (c === openChar) depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) return text.slice(startIdx, i + 1);
    }
  }
  throw new Error(`unbalanced ${openChar}${closeChar} starting at ${startIdx}`);
}

/**
 * Finds `marker` in `source`, then evaluates the first non-empty `[...]`
 * array literal that follows it as plain JS (no JSX involved — these
 * literals are only strings/numbers/objects/arrays). Skips an empty `[]`
 * pair, because a type annotation like `const X: Foo[] = [...]` has its own
 * `[]` before the real literal.
 */
function extractArrayLiteralAfter(source, marker) {
  const markerIdx = source.indexOf(marker);
  assert.ok(markerIdx !== -1, `marker not found in source: ${marker}`);
  let searchFrom = markerIdx + marker.length;
  for (;;) {
    const bracketIdx = source.indexOf("[", searchFrom);
    assert.ok(bracketIdx !== -1, `no array literal found after marker: ${marker}`);
    if (source[bracketIdx + 1] === "]") {
      // an empty-bracket type annotation (e.g. `Foo[]`) — keep looking
      searchFrom = bracketIdx + 2;
      continue;
    }
    const literal = sliceBalanced(source, bracketIdx, "[", "]");
    // Evaluating a known-plain-data array literal sliced from this repo's own source, not external input.
    return new Function(`return ${literal};`)();
  }
}

function readSource(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), "utf-8");
}

// --- app/(zh)/tools/anti-fraud/FraudMethodsGuide.tsx ---

test("FraudMethodsGuide.tsx: METHODS identifyPoints with a hotline mention preserve wording and link the right number", () => {
  const source = readSource("app/(zh)/tools/anti-fraud/FraudMethodsGuide.tsx");
  const methods = extractArrayLiteralAfter(source, "const METHODS");

  const fakeOfficial = methods.find((m) => m.title === "假冒公務員");
  const fakeOfficialPoint = fakeOfficial.identifyPoints[2];
  assert.ok(Array.isArray(fakeOfficialPoint), "假冒公務員's 3rd identifyPoint should be a segment array");
  assert.equal(
    plainTextOf(fakeOfficialPoint),
    "接到這類電話應直接掛斷，改撥 165 或原機關公開電話查證，不要回撥來電顯示的號碼",
  );
  assert.deepEqual(
    fakeOfficialPoint.filter(isPhoneLinkSegment).map((s) => s.tel),
    ["165"],
  );

  const fakeRomance = methods.find((m) => m.title === "假交友");
  const fakeRomancePoint = fakeRomance.identifyPoints[2];
  assert.ok(Array.isArray(fakeRomancePoint), "假交友's 3rd identifyPoint should be a segment array");
  assert.equal(plainTextOf(fakeRomancePoint), "一旦對方以任何理由要求金錢往來，應先暫停聯繫並向 165 查證");
  assert.deepEqual(
    fakeRomancePoint.filter(isPhoneLinkSegment).map((s) => s.tel),
    ["165"],
  );

  // 假網拍's 3rd point mentions "165全民防騙網" by name (the website, paired
  // with its own sourceUrl https://165.npa.gov.tw/) rather than instructing
  // a phone call — deliberately left as a plain string, not a tel: segment.
  const fakeAuction = methods.find((m) => m.title === "假網拍");
  assert.equal(typeof fakeAuction.identifyPoints[2], "string");
  assert.match(fakeAuction.identifyPoints[2], /165 全民防騙網查詢/);
});

test("FraudMethodsGuide.tsx: RESPONSE_STEPS preserve wording and link 165/110 where they instruct dialing", () => {
  const source = readSource("app/(zh)/tools/anti-fraud/FraudMethodsGuide.tsx");
  const steps = extractArrayLiteralAfter(source, "const RESPONSE_STEPS");

  const callHotline = steps[0];
  assert.ok(Array.isArray(callHotline.step));
  assert.equal(plainTextOf(callHotline.step), "撥打165查證或求助");
  assert.deepEqual(callHotline.step.filter(isPhoneLinkSegment).map((s) => s.tel), ["165"]);

  assert.ok(Array.isArray(callHotline.description));
  assert.equal(
    plainTextOf(callHotline.description),
    "無論是尚在查證可疑訊息，還是已經確定受騙，第一步都是撥打 165 反詐騙諮詢專線（免付費），說明情況並依指示處理。",
  );
  assert.deepEqual(callHotline.description.filter(isPhoneLinkSegment).map((s) => s.tel), ["165"]);

  const reportToPolice = steps.find((s) => s.step === "向警察機關報案");
  assert.ok(Array.isArray(reportToPolice.description));
  assert.equal(
    plainTextOf(reportToPolice.description),
    "到就近派出所或撥打 110 報案，取得受理案件證明單（三聯單），這是後續申請圈存、保險理賠或其他求助程序常需要的文件。",
  );
  assert.deepEqual(reportToPolice.description.filter(isPhoneLinkSegment).map((s) => s.tel), ["110"]);
});

test("FraudMethodsGuide.tsx: renders tel: segments through the shared TextWithPhoneLinks component", () => {
  const source = readSource("app/(zh)/tools/anti-fraud/FraudMethodsGuide.tsx");
  assert.match(source, /import \{ TextWithPhoneLinks \} from "@\/components\/Common\/TextWithPhoneLinks"/);
  assert.match(source, /<TextWithPhoneLinks value=\{point\} \/>/);
  assert.match(source, /<TextWithPhoneLinks value=\{item\.step\} \/>/);
  assert.match(source, /<TextWithPhoneLinks value=\{item\.description\} \/>/);
});

// --- components/Tools/socialWelfareCentersShared.ts (JSX-free — imported directly) ---

test("socialWelfareCentersShared.ts: SITUATIONS steps with a hotline mention preserve wording and link the right number(s)", async () => {
  const { SITUATIONS } = await import("../components/Tools/socialWelfareCentersShared.ts");

  const byId = Object.fromEntries(SITUATIONS.map((s) => [s.id, s]));

  const expectations = [
    {
      id: "financial-hardship",
      stepIndex: 0,
      text: "撥打 1957 福利諮詢專線（免付費，每日 08:00-22:00），由專人依您的狀況轉介適合的補助與資源。",
      tels: ["1957"],
    },
    {
      id: "caregiver-burnout",
      stepIndex: 0,
      text: "撥打 1966 長照服務專線（前 5 分鐘免付費，週一至週五 08:30-12:00、13:30-17:30），申請長照需求評估。",
      tels: ["1966"],
    },
    {
      id: "caregiver-burnout",
      stepIndex: 1,
      text: "撥打 1957 福利諮詢專線（免付費，每日 08:00-22:00），尋求資源轉介與情緒支持。",
      tels: ["1957"],
    },
    {
      id: "domestic-violence-child-abuse",
      stepIndex: 0,
      text: "立刻撥打 113 全國保護專線（24 小時、免付費，聽語障人士可撥打 113 簡訊報案）。",
      tels: ["113", "113"],
    },
    {
      id: "domestic-violence-child-abuse",
      stepIndex: 2,
      text: "如有立即的生命安全危險，請先撥打 110 或 119 求援，再聯繫 113 後續協助。",
      tels: ["110", "119", "113"],
    },
    {
      id: "elderly-living-alone",
      stepIndex: 0,
      text: "撥打 1957 福利諮詢專線，詢問所在地的獨居長輩關懷與送餐服務。",
      tels: ["1957"],
    },
    {
      id: "elderly-living-alone",
      stepIndex: 1,
      text: "撥打 1966 長照服務專線，申請長照需求評估（居家服務、送餐、緊急救援連線等）。",
      tels: ["1966"],
    },
    {
      id: "teen-pregnancy",
      stepIndex: 0,
      text: "撥打全國未成年懷孕求助專線 0800-25-7085（衛生福利部社會及家庭署）。",
      tels: ["0800257085"],
    },
  ];

  for (const { id, stepIndex, text, tels } of expectations) {
    const step = byId[id].steps[stepIndex];
    assert.ok(Array.isArray(step.label), `${id} step[${stepIndex}].label should be a segment array`);
    assert.equal(plainTextOf(step.label), text, `${id} step[${stepIndex}] lost or changed wording`);
    assert.deepEqual(
      step.label.filter(isPhoneLinkSegment).map((s) => s.tel),
      tels,
      `${id} step[${stepIndex}] tel targets`,
    );
  }

  // Steps that carry a `href` link instead of a phone number stay plain strings.
  assert.equal(typeof byId["financial-hardship"].steps[1].label, "string");
  assert.equal(byId["financial-hardship"].steps[1].href, "https://dep.mohw.gov.tw/DOSAASW/");
});

// --- components/Tools/LtcBenefitsContent.tsx ---

test("LtcBenefitsContent.tsx: APPLICATION_STEPS[0].title preserves wording and links 1966", () => {
  const source = readSource("components/Tools/LtcBenefitsContent.tsx");
  const steps = extractArrayLiteralAfter(source, "const APPLICATION_STEPS");

  assert.ok(Array.isArray(steps[0].title));
  assert.equal(plainTextOf(steps[0].title), "撥打 1966 長照專線");
  assert.deepEqual(steps[0].title.filter(isPhoneLinkSegment).map((s) => s.tel), ["1966"]);

  // Steps 2 and 3 have no phone number — still plain strings.
  assert.equal(typeof steps[1].title, "string");
  assert.equal(typeof steps[2].title, "string");

  assert.match(source, /<TextWithPhoneLinks value=\{step\.title\} \/>/);
});

// --- app/(zh)/tools/stress/StressAssessment.tsx ---

test("StressAssessment.tsx: the 高度壓力 coping-strategy mentioning 1925 preserves wording and links it", () => {
  const source = readSource("app/(zh)/tools/stress/StressAssessment.tsx");
  // There are 3 `copingStrategies:` arrays (低/中/高壓力); the 1925 mention
  // is only in the 3rd (高度壓力) one, so anchor on that branch specifically.
  const highStressBranchIdx = source.indexOf('level: "高度壓力"');
  assert.ok(highStressBranchIdx !== -1, "高度壓力 branch not found");
  const strategies = extractArrayLiteralAfter(source.slice(highStressBranchIdx), "copingStrategies:");

  const phoneItem = strategies.find((item) => Array.isArray(item));
  assert.ok(phoneItem, "expected exactly one segment-array item in 高度壓力's copingStrategies");
  assert.equal(plainTextOf(phoneItem), "向家人、朋友或心理諮詢熱線尋求支持（台灣：1925 安心專線）");
  assert.deepEqual(phoneItem.filter(isPhoneLinkSegment).map((s) => s.tel), ["1925"]);

  // Every other coping-strategy item in that branch has no phone number.
  const plainCount = strategies.filter((item) => typeof item === "string").length;
  assert.equal(plainCount, strategies.length - 1);

  assert.match(source, /<TextWithPhoneLinks value=\{tip\} \/>/);
});

// --- Low/mid-stress coping strategies are untouched plain strings (no phone mentions) ---

test("StressAssessment.tsx: 低壓力/中度壓力 coping strategies have no phone mentions and stay plain strings", () => {
  const source = readSource("app/(zh)/tools/stress/StressAssessment.tsx");
  const lowStressBranchIdx = source.indexOf('level: "低壓力"');
  const midStressBranchIdx = source.indexOf('level: "中度壓力"');
  assert.ok(lowStressBranchIdx !== -1 && midStressBranchIdx !== -1);

  const lowStrategies = extractArrayLiteralAfter(source.slice(lowStressBranchIdx), "copingStrategies:");
  const midStrategies = extractArrayLiteralAfter(source.slice(midStressBranchIdx), "copingStrategies:");

  for (const strategies of [lowStrategies, midStrategies]) {
    assert.ok(strategies.every((item) => typeof item === "string"));
  }
});
