import { decodeBig5 } from "@/lib/server/facilities/csv";

/**
 * Decodes a CSV response body whose actual charset isn't reliably knowable
 * ahead of time — moeaea.gov.tw's `wHandOpenData_File.ashx` and Taipower's
 * `.csv` exports serve plain CSV bodies with no charset in Content-Type, and
 * this repo has already hit both UTF-8 and Big5 government CSV exports (see
 * lib/server/water/ingestWaterOutages.ts vs lib/server/metroAlerts/runSync.ts).
 * Tries UTF-8 first and falls back to Big5 only if the UTF-8 decode produced
 * the U+FFFD replacement character, which a clean UTF-8 payload never does.
 */
export function decodeCsvBuffer(buffer: Buffer): string {
  const utf8 = buffer.toString("utf-8").replace(/^﻿/, "");
  if (!utf8.includes("�")) return utf8;
  return decodeBig5(buffer).replace(/^﻿/, "");
}
