import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

test("IndexNow key verification file exists in public directory and matches key format", () => {
  const defaultKey = "c0e7b8782f9c464c8d5c414995f7c32e";
  assert.match(defaultKey, /^[0-9a-f]{32}$/, "Default IndexNow key should be 32 hex chars");

  const keyFilePath = resolve(REPO_ROOT, `public/${defaultKey}.txt`);
  assert.ok(existsSync(keyFilePath), `Verification file public/${defaultKey}.txt must exist`);

  const fileContent = readFileSync(keyFilePath, "utf8").trim();
  assert.equal(fileContent, defaultKey, "Verification file content must match the key");
});

test("Microsoft Clarity tracking component exists and contains the requested project id", () => {
  const clarityPath = resolve(REPO_ROOT, "components/Analytics/MicrosoftClarity.tsx");
  assert.ok(existsSync(clarityPath), "MicrosoftClarity.tsx must exist");

  const clarityContent = readFileSync(clarityPath, "utf8");
  assert.ok(clarityContent.includes("ye0lvdgk17"), "Clarity script must use project ID ye0lvdgk17");
  assert.ok(clarityContent.includes("https://www.clarity.ms/tag/"), "Clarity script must point to clarity.ms tag");
});
