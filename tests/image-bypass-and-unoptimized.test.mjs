import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execSync } from "node:child_process";

test("next.config.js enforces images.unoptimized = true", () => {
  const content = fs.readFileSync("next.config.js", "utf8");
  assert.match(
    content,
    /unoptimized:\s*true/,
    "next.config.js must explicitly configure images.unoptimized = true to disable server image processing",
  );
});

test(".remote-health-index.php contains valid PHP syntax and fast _next/image bypass", () => {
  // 1. Lint check
  const lintOutput = execSync("php -l .remote-health-index.php", { encoding: "utf8" });
  assert.match(lintOutput, /No syntax errors detected/);

  // 2. Structural checks
  const phpContent = fs.readFileSync(".remote-health-index.php", "utf8");
  assert.ok(
    phpContent.includes("str_starts_with($path, '/_next/image')"),
    ".remote-health-index.php must intercept /_next/image paths before forwarding to Node.js",
  );
  assert.ok(
    phpContent.includes("str_starts_with($imgUrl, '/images/')"),
    ".remote-health-index.php must handle local /images/ paths by streaming directly from disk",
  );
  assert.ok(
    phpContent.includes("header('Location: ' . $imgUrl, true, 302);"),
    ".remote-health-index.php must redirect external image URLs directly via 302",
  );
  assert.ok(
    phpContent.includes("http_response_code(404);"),
    ".remote-health-index.php must return 404 for nonexistent image requests rather than proxying to Node.js",
  );
});
