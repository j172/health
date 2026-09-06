import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SERVER_LIB_DIR = resolve(REPO_ROOT, "lib/server");

function getAllTsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

test("lib/server/**/*.ts must never call global fetch() to prevent undici WebAssembly OOM crash", () => {
  const tsFiles = getAllTsFiles(SERVER_LIB_DIR);
  assert.ok(tsFiles.length > 10, "Should find server TypeScript files");

  const violations = [];

  for (const file of tsFiles) {
    const content = readFileSync(file, "utf8");
    // Strip comments to only check actual code
    const codeWithoutComments = content
      .replace(/\/\*[\s\S]*?\*\//g, "") // remove block comments
      .replace(/\/\/.*/g, ""); // remove line comments

    // Look for fetch( calls
    const fetchCallRegex = /(?:^|[^\w$.])fetch\s*\(/g;
    let match;
    while ((match = fetchCallRegex.exec(codeWithoutComments)) !== null) {
      violations.push({
        file: file.replace(REPO_ROOT, "").replace(/\\/g, "/"),
        snippet: codeWithoutComments.slice(Math.max(0, match.index - 20), match.index + 30),
      });
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found forbidden global fetch() call(s) in lib/server:\n${JSON.stringify(violations, null, 2)}.\nUse httpRequest or httpGetText from @/lib/server/net/httpClient instead.`,
  );
});
