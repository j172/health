/** "YouBike2.0_捷運市政府站" → "捷運市政府站". Shared by the open-data parsers and the TDX mapper. */
export function cleanName(raw?: string | null): string {
  return (raw || "").replace(/^YouBike2\.0_/i, "").trim();
}

/** Normalises "20260911203000" / "2026-09-11T20:30:00" / "2026-09-11 20:30:00" to MySQL DATETIME text; falls back to now. */
export function formatTime(str?: string | null): string {
  if (!str) return new Date().toISOString().slice(0, 19).replace("T", " ");
  const clean = str.replace(/[- :T]/g, "");
  if (clean.length >= 14) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)} ${clean.slice(8, 10)}:${clean.slice(10, 12)}:${clean.slice(12, 14)}`;
  }
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}
