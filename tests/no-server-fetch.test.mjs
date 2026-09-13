import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function getAllTsFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllTsFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      results.push(fullPath);
    }
  }
  return results;
}

function stripComments(content) {
  // Strip block comments /* ... */ while preserving line breaks so line numbers stay accurate
  const noBlockComments = content.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    const lineBreaks = match.match(/\n/g);
    return lineBreaks ? lineBreaks.join("") : "";
  });

  // Strip line comments // ...
  return noBlockComments
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      if (idx !== -1) {
        return line.slice(0, idx);
      }
      return line;
    })
    .join("\n");
}

export function findServerFetchViolations(fileContent, filePath = "") {
  const cleaned = stripComments(fileContent);
  const lines = cleaned.split("\n");
  const violations = [];

  // Match global fetch(...) but exclude member calls like source.fetch() or this.fetch()
  const fetchPattern = /(?<![.\w])fetch\s*\(/;

  lines.forEach((line, index) => {
    if (fetchPattern.test(line)) {
      violations.push({
        file: filePath,
        line: index + 1,
        code: line.trim(),
      });
    }
  });

  return violations;
}

test("Regression Guard: No server-side code calls global fetch() (prevents WebAssembly OOM 502)", () => {
  const rootDir = process.cwd();
  const serverDirs = [
    path.join(rootDir, "lib", "server"),
    path.join(rootDir, "app", "api"),
  ];

  const files = serverDirs.flatMap((dir) => getAllTsFiles(dir));
  assert.ok(files.length > 20, `Expected multiple server TypeScript files, found ${files.length}`);

  const allViolations = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const relPath = path.relative(rootDir, file).replace(/\\/g, "/");
    const violations = findServerFetchViolations(content, relPath);
    if (violations.length > 0) {
      allViolations.push(...violations);
    }
  }

  if (allViolations.length > 0) {
    const errorDetails = allViolations
      .map((v) => `  - ${v.file}:${v.line} -> ${v.code}`)
      .join("\n");
    assert.fail(
      `Found forbidden global fetch() call(s) in server code (causes WebAssembly OOM 502 crash under ulimit -v):\n${errorDetails}\nUse httpRequest() or httpGetText() from '@/lib/server/net/httpClient' instead.`
    );
  }

  assert.equal(allViolations.length, 0);
});

test("Regression Guard detection unit tests: correctly distinguishes global fetch vs member method calls", () => {
  // Test case 1: comment should be ignored
  const commented = `
    // const res = await fetch("https://example.com");
    /*
      const x = fetch("https://test.com");
    */
  `;
  assert.deepEqual(findServerFetchViolations(commented), []);

  // Test case 2: object method call should be ignored
  const memberCall = `
    const events = await source.fetch();
    const data = this.fetch();
  `;
  assert.deepEqual(findServerFetchViolations(memberCall), []);

  // Test case 3: real global fetch should be caught
  const prohibited = `
    const res = await fetch("https://example.com");
  `;
  const violations = findServerFetchViolations(prohibited, "test.ts");
  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 2);
});
