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
    source.includes('const locale = mounted ? userLocale : "zh-TW";'),
    "Must lock locale to zh-TW during SSR and initial hydration pass",
  );
});
