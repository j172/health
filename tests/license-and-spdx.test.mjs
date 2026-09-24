import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("package.json declares valid composite SPDX license and preserves private flag", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(
    pkg.license,
    "MIT AND CC0-1.0",
    "package.json must declare 'MIT AND CC0-1.0' composite SPDX license identifier",
  );
  assert.equal(
    pkg.private,
    true,
    "package.json must preserve 'private: true' to avoid accidental npm registry publishing",
  );
});

test("LICENSE contains composite preamble, MIT license, and CC0-1.0 universal legal text", () => {
  const licenseText = fs.readFileSync("LICENSE", "utf8");

  // Check preamble & structure
  assert.match(licenseText, /MIT AND CC0-1\.0/);
  assert.match(licenseText, /Software Source Code \(MIT License\)/);
  assert.match(licenseText, /Curated Data, Schemas, and Metadata \(CC0-1\.0 Universal\)/);
  assert.match(licenseText, /Taiwan Open Government Data/);
  assert.match(licenseText, /OGDL-Taiwan-1\.0/);

  // Check copyright holders in MIT section
  assert.match(licenseText, /Copyright \(c\) 2023 Next\.js Templates/);
  assert.match(licenseText, /Copyright \(c\) 2026 j172tw/);

  // Check CC0 1.0 Legal Code
  assert.match(licenseText, /CC0 1\.0 Universal/);
  assert.match(licenseText, /CREATIVE COMMONS CORPORATION IS NOT A LAW FIRM/);
  assert.match(licenseText, /Statement of Purpose/);
  assert.match(licenseText, /Affirmer hereby overtly/);
  assert.match(licenseText, /unconditionally waives/);
});

test("README.md contains License and Open Data Attribution section", () => {
  const readmeText = fs.readFileSync("README.md", "utf8");
  assert.match(readmeText, /授權條款與資料權益/);
  assert.match(readmeText, /MIT AND CC0-1\.0/);
  assert.match(readmeText, /CC0-1\.0 Universal/);
  assert.match(readmeText, /OGDL-Taiwan-1\.0/);
});

test("app/llms.txt and app/llms-full.txt routes declare CC0-1.0 open access for AI agents", () => {
  const llmsTxt = fs.readFileSync("app/llms.txt/route.ts", "utf8");
  assert.match(llmsTxt, /SPDX: MIT AND CC0-1\.0/);
  assert.match(llmsTxt, /CC0-1\.0 公眾領域宣告/);

  const llmsFullTxt = fs.readFileSync("app/llms-full.txt/route.ts", "utf8");
  assert.match(llmsFullTxt, /SPDX: MIT AND CC0-1\.0/);
  assert.match(llmsFullTxt, /CC0-1\.0 Universal 公眾領域宣告/);
});

test("locales contain footer license string definitions", () => {
  const zh = JSON.parse(fs.readFileSync("locales/zh-TW.json", "utf8"));
  assert.ok(zh.footer?.license, "zh-TW.json must have footer.license");
  assert.match(zh.footer.license, /MIT/);
  assert.match(zh.footer.license, /CC0-1\.0/);

  const en = JSON.parse(fs.readFileSync("locales/en.json", "utf8"));
  assert.ok(en.footer?.license, "en.json must have footer.license");
  assert.match(en.footer.license, /MIT/);
  assert.match(en.footer.license, /CC0-1\.0/);

  const ja = JSON.parse(fs.readFileSync("locales/ja.json", "utf8"));
  assert.ok(ja.footer?.license, "ja.json must have footer.license");
  assert.match(ja.footer.license, /MIT/);
  assert.match(ja.footer.license, /CC0-1\.0/);

  const ko = JSON.parse(fs.readFileSync("locales/ko.json", "utf8"));
  assert.ok(ko.footer?.license, "ko.json must have footer.license");
  assert.match(ko.footer.license, /MIT/);
  assert.match(ko.footer.license, /CC0-1\.0/);
});
