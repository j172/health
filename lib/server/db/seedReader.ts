import fs from "node:fs";
import path from "node:path";

/**
 * Reads a bundled seed JSON file reliably across both local development (data/)
 * and production prebuilt deployments (public/data/).
 */
export function readSeedJson<T = unknown>(filename: string): T | null {
  const candidates = [
    path.join(/*turbopackIgnore: true*/ process.cwd(), "data", filename),
    path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "data", filename),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
      }
    } catch {
      // Continue to next candidate
    }
  }
  return null;
}
