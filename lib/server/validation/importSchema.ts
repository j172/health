import type { z } from "zod";

/**
 * Validates a raw array fetched from an upstream government open-data source
 * against a zod schema covering its *critical* fields — the small subset of
 * columns later ingestion logic actually depends on (mainly the fields used
 * to build `sourceId`/identity keys and the fields downstream code reads
 * unconditionally). This exists because this site has repeatedly been
 * burned by upstream datasets silently renaming or dropping a column (see
 * `docs/specs/mol-occupational-injury-source-id-migration.md`,
 * `docs/specs/drug-label-source-blocked.md`,
 * `docs/specs/fix-facility-cross-county-coordinate-mismatch.md`) with no
 * warning beyond bad data quietly landing in MySQL.
 *
 * Design choice: critical-field schemas should type each field as
 * `string | null` (via `.nullable()`), never `.optional()`/`.nullish()`.
 * That way:
 *   - A field that is genuinely absent from every row (renamed/removed
 *     upstream) fails validation immediately — `undefined` is rejected by
 *     `.nullable()`.
 *   - A single row's legitimately empty/null value for that field — normal
 *     government open-data noise, not a schema change — still passes, so
 *     this check does not reject otherwise-normal data.
 *
 * On failure this throws a single descriptive `Error` (never swallows it)
 * summarizing how many rows failed and a sample of what went wrong. Callers
 * already run inside `runSource()` (`lib/server/sync/runSource.ts`), whose
 * try/catch turns a thrown Error into that source's `error` field and logs
 * it — so throwing here is what actually surfaces the failure instead of
 * letting bad data through silently.
 */
export function validateImportRows<T extends z.ZodTypeAny>(
  sourceLabel: string,
  rowSchema: T,
  raw: unknown,
): void {
  if (!Array.isArray(raw)) {
    throw new Error(
      `${sourceLabel} schema validation failed: expected an array from the upstream response, got ${typeof raw}. The upstream API shape may have changed.`,
    );
  }

  // An empty array is a legitimate (if unusual) upstream response — e.g. a
  // dataset that's temporarily empty. Reject that with a "0 rows" signal
  // elsewhere (existing `.filter()`/count-based checks), not here: this
  // function's job is schema shape, not row count.
  if (raw.length === 0) return;

  const issues = raw.flatMap((row, index) => {
    const result = rowSchema.safeParse(row);
    if (result.success) return [];
    return result.error.issues.map(
      (issue) => `row ${index} field "${issue.path.join(".")}": ${issue.message}`,
    );
  });

  if (issues.length === 0) return;

  const failingRowCount = new Set(
    issues.map((issue) => issue.match(/^row (\d+) /)?.[1]),
  ).size;
  const sample = issues.slice(0, 8).join("; ");
  const more = issues.length > 8 ? ` (+${issues.length - 8} more issue(s))` : "";

  throw new Error(
    `${sourceLabel} schema validation failed: ${failingRowCount}/${raw.length} row(s) failed critical-field validation — an upstream field may have been renamed, removed, or changed type. Sample: ${sample}${more}`,
  );
}
