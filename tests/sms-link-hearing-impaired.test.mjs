import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Regression guard (2026-10-22): the 110/119 cards in EmergencyHotlinesContent
// also show the deaf/speech-impaired reporting SMS numbers (0911-511-110 /
// 0911-511-119). Those are SMS-only lines, not voice numbers, so they must be
// `sms:` links (not `tel:`), mirroring this repo's existing `tel:` link
// convention of wrapping a displayed phone number in an anchor whose href
// strips the dashes.

test("Structural Guard: EmergencyHotlinesContent.tsx wraps the deaf/speech-impaired SMS numbers with sms: links", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "components/Tools/EmergencyHotlinesContent.tsx"),
    "utf-8",
  );

  assert.match(content, /<a href="sms:0911511110"[^>]*>\s*0911-511-110\s*<\/a>/);
  assert.match(content, /<a href="sms:0911511119"[^>]*>\s*0911-511-119\s*<\/a>/);

  // Not accidentally wrapped as voice tel: links instead.
  assert.doesNotMatch(content, /href="tel:0911511110"/);
  assert.doesNotMatch(content, /href="tel:0911511119"/);
});
