import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isGoogleNewsUrl,
  extractDecodeParams,
  buildDecodeRequestBody,
  parseDecodeResponse,
  resolveGoogleNewsRedirect,
} from "./resolveGoogleNewsRedirect.mjs";

test("isGoogleNewsUrl: recognizes news.google.com article-shell URLs", () => {
  assert.equal(
    isGoogleNewsUrl(
      "https://news.google.com/rss/articles/CBMiS0FVX3lxTFAxVHpYZUlXSG41S3JtTzVEeWZ2bDdnYmt3OTREcXFQUzBndnFSQ2YySjVKb1UwRFFTQTAwMThxc2c1Tk1IRTV3eXY3TQ?oc=5",
    ),
    true,
  );
  assert.equal(isGoogleNewsUrl("https://news.google.com/rss/search?q=site:csr.cw.com.tw"), true);
});

test("isGoogleNewsUrl: rejects real publisher URLs and junk input", () => {
  assert.equal(isGoogleNewsUrl("https://csr.cw.com.tw/article/44832"), false);
  assert.equal(isGoogleNewsUrl("https://www.google.com/search?q=news"), false);
  assert.equal(isGoogleNewsUrl(""), false);
  assert.equal(isGoogleNewsUrl(null), false);
  assert.equal(isGoogleNewsUrl(undefined), false);
  assert.equal(isGoogleNewsUrl("not a url"), false);
});

test("extractDecodeParams: pulls the signed garturlreq params off the splash page", () => {
  const html =
    '<div data-p="..." data-n-a-id="CBMiS0FVX3lxTFA" data-n-a-ts="1789838188" data-n-a-sg="Ae5Wzi8CGig2w_fCBWYvvPToVJbP" data-n-dnlg="false"></div>';
  const params = extractDecodeParams(html);
  assert.deepEqual(params, {
    articleId: "CBMiS0FVX3lxTFA",
    signature: "Ae5Wzi8CGig2w_fCBWYvvPToVJbP",
    timestamp: 1789838188,
  });
});

test("extractDecodeParams: returns null when any of the three attributes is missing", () => {
  assert.equal(extractDecodeParams("<html><body>no splash data here</body></html>"), null);
  assert.equal(extractDecodeParams('<div data-n-a-id="X" data-n-a-ts="1"></div>'), null); // missing sg
  assert.equal(extractDecodeParams(""), null);
  assert.equal(extractDecodeParams(null), null);
});

test("buildDecodeRequestBody: produces a well-formed f.req= form body carrying the params", () => {
  const body = buildDecodeRequestBody({
    articleId: "ART_ID",
    timestamp: 1700000000,
    signature: "SIG_VALUE",
  });

  assert.match(body, /^f\.req=/);
  const decoded = decodeURIComponent(body.slice("f.req=".length));
  const outer = JSON.parse(decoded);
  // [[["Fbv4je", "<inner json string>", null, "generic"]]]
  assert.equal(outer[0][0][0], "Fbv4je");
  const inner = JSON.parse(outer[0][0][1]);
  assert.equal(inner[0], "garturlreq");
  assert.equal(inner[2], "ART_ID");
  assert.equal(inner[3], 1700000000);
  assert.equal(inner[4], "SIG_VALUE");
});

test("parseDecodeResponse: parses a real batchexecute response shape", () => {
  // Captured live 2026-09-20 resolving a real csr_cw Google News shell URL.
  const raw =
    ")]}'\n\n[[\"wrb.fr\",\"Fbv4je\",\"[\\\"garturlres\\\",\\\"https://csr.cw.com.tw/article/44832\\\",1]\",null,null,null,\"generic\"],[\"di\",12],[\"af.httprm\",12,\"9006143575331449040\",1]]";
  assert.equal(parseDecodeResponse(raw), "https://csr.cw.com.tw/article/44832");
});

test("parseDecodeResponse: returns null on malformed/unexpected shapes (fail-safe)", () => {
  assert.equal(parseDecodeResponse(""), null);
  assert.equal(parseDecodeResponse(null), null);
  assert.equal(parseDecodeResponse("not even json"), null);
  assert.equal(parseDecodeResponse(")]}'\n\n[]"), null);
  assert.equal(parseDecodeResponse(")]}'\n\n[[\"wrb.fr\",\"Fbv4je\",\"not json\",null]]"), null);
});

test("resolveGoogleNewsRedirect: non-google-news URLs resolve to null without any network call", async () => {
  assert.equal(await resolveGoogleNewsRedirect("https://csr.cw.com.tw/article/44832"), null);
  assert.equal(await resolveGoogleNewsRedirect(""), null);
  assert.equal(await resolveGoogleNewsRedirect(null), null);
});
