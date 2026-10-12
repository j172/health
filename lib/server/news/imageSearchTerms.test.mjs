import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

const REPO_ROOT = new URL("../../../", import.meta.url);

// Same resolver shim the other lib tests use (see heroImage.test.mjs,
// tests/thematicCoverAndCardThumb.test.mjs): adds extensionless ".ts"
// resolution for relative imports, "@/" alias resolution, a no-op shim for
// "server-only", and — new for this file — an import-attributes fix so
// cedict.ts's dynamic `import("@/lib/server/news/data/cedict-terms.json")`
// resolves under the plain Node test runner the way it already does under
// webpack/Next.js at build time.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      const target = specifier.slice(2);
      const url = new URL(target, REPO_ROOT);
      if (url.pathname.endsWith(".json")) {
        return {
          url: url.href,
          format: "json",
          importAttributes: { type: "json" },
          shortCircuit: true,
        };
      }
      for (const extension of [".ts", ".tsx", ".js", ".mjs"]) {
        const candidate = new URL(target + extension, REPO_ROOT);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
      return nextResolve(url.href, context);
    }
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(specifier + extension, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(specifier + extension, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { deriveJiebaSearchTerm, deriveDictionaryTerm, deriveFallbackTerm, deriveSearchTerm, FALLBACK_TERMS } =
  await import("./imageSearchTerms.ts");

test("deriveJiebaSearchTerm matches via full-title substring (tokenizer-independent stage)", () => {
  assert.equal(deriveJiebaSearchTerm("蝦仁炒飯食譜大公開"), "seafood");
  assert.equal(deriveJiebaSearchTerm("新北市擴大社區長照2.0日間照顧中心"), "caregiver");
  assert.equal(deriveJiebaSearchTerm("2026台灣淨零轉型與企業永續發展論壇"), "sustainability");
  assert.equal(deriveJiebaSearchTerm(""), null);
});

test("deriveJiebaSearchTerm returns null when no KEYWORD_TERMS pattern appears anywhere in the title", () => {
  assert.equal(deriveJiebaSearchTerm("移至數發部發布《NGO/NPO數據轉型手冊》"), null);
});

test("deriveDictionaryTerm (Intl.Segmenter-backed) picks a clean word-bounded token and resolves it via CC-CEDICT", async () => {
  // Regression coverage for issue #480's A/B test: this exact title was one
  // of the cases where the previous segmentit-based tokenizer produced a
  // token that crossed word boundaries ("興菸品減害") and matched nothing in
  // CC-CEDICT, while Intl.Segmenter correctly isolates "揭穿" (expose).
  assert.equal(
    await deriveDictionaryTerm("揭穿新興菸品減害迷思　實際危害不容忽視"),
    "expose",
  );
  // Another A/B differing case: "發起人" (proposer/initiator) vs segmentit's
  // boundary-crossing "人歷經破產".
  assert.equal(
    await deriveDictionaryTerm("曾是科技業老將！鍘美藝術節發起人歷經破產"),
    "proposer",
  );
});

test("deriveDictionaryTerm returns null for an empty title or when no token resolves in CC-CEDICT", async () => {
  assert.equal(await deriveDictionaryTerm(""), null);
  // Pure brand/English-token title: nothing left after stopword/number/
  // length filtering resolves to a CC-CEDICT entry.
  assert.equal(await deriveDictionaryTerm("COZZI Blu 1 2 3"), null);
});

test("deriveFallbackTerm rotates deterministically through FALLBACK_TERMS by id", () => {
  assert.equal(deriveFallbackTerm(0), FALLBACK_TERMS[0]);
  assert.equal(deriveFallbackTerm(1), FALLBACK_TERMS[1]);
  assert.equal(deriveFallbackTerm(-1), FALLBACK_TERMS[1]);
});

test("deriveSearchTerm (legacy wrapper) falls back when Jieba match misses", () => {
  assert.equal(deriveSearchTerm("蝦仁炒飯食譜大公開", 0), "seafood");
  assert.equal(
    deriveSearchTerm("完全不含任何關鍵字的標題文字", 0),
    deriveFallbackTerm(0),
  );
});
