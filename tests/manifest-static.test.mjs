import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("public/manifest.webmanifest: exists and is valid PWA manifest JSON", () => {
  const filePath = path.join(process.cwd(), "public", "manifest.webmanifest");
  assert.ok(fs.existsSync(filePath), "public/manifest.webmanifest must exist");

  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw);

  assert.equal(data.name, "j172tw Healthz");
  assert.equal(data.short_name, "j172tw Healthz");
  assert.equal(data.start_url, "/news");
  assert.equal(data.display, "standalone");
  assert.equal(data.lang, "zh-TW");
  assert.ok(Array.isArray(data.icons) && data.icons.length >= 3);
});

test(".remote-health-index.php: contains static bypass for /manifest.webmanifest", () => {
  const phpPath = path.join(process.cwd(), ".remote-health-index.php");
  assert.ok(fs.existsSync(phpPath), ".remote-health-index.php must exist");

  const php = fs.readFileSync(phpPath, "utf-8");
  assert.ok(
    php.includes("/manifest.webmanifest"),
    ".remote-health-index.php must contain manifest.webmanifest bypass",
  );
  assert.ok(
    php.includes("application/manifest+json"),
    ".remote-health-index.php must serve application/manifest+json",
  );
});
