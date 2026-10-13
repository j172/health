import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("app/context/LanguageContext.tsx: contains mounted hydration guard for React 19", () => {
  const filePath = path.join(process.cwd(), "app", "context", "LanguageContext.tsx");
  assert.ok(fs.existsSync(filePath), "LanguageContext.tsx must exist");

  const source = fs.readFileSync(filePath, "utf-8");

  assert.ok(
    source.includes("const [mounted, setMounted] = useState(false);"),
    "Must define mounted state initialized to false",
  );
  assert.ok(
    source.includes("setMounted(true);"),
    "Must set mounted to true after initial hydration effect",
  );
  assert.ok(
    // issue #485 wraps the original `mounted ? userLocale : "zh-TW"`
    // fallback in `forcedLocale ?? (...)` — a locale-prefixed /en//ja//ko/
    // route passes forcedLocale and short-circuits past this hydration
    // dance entirely (its server HTML already matches that locale from the
    // first byte), while the default zh-TW tree's `mounted`-gated fallback
    // for SSR/initial hydration is unchanged.
    source.includes('const locale = forcedLocale ?? (mounted ? userLocale : "zh-TW");'),
    "Must lock locale to zh-TW during SSR and initial hydration pass (or forcedLocale on a locked route)",
  );
});
