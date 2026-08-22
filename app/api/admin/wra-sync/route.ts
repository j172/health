import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runWraDroughtSync } from "@/lib/server/wra/runSync";
import type { WraDroughtRecord } from "@/lib/server/wra/client";

export const runtime = "nodejs";

const text = (value: unknown): string =>
  value == null ? "" : String(value).trim();

/**
 * Accepts either WRA's own field names or the normalized ASCII ones, so the
 * runner can post the upstream rows through untouched.
 */
const toRecord = (row: Record<string, unknown>): WraDroughtRecord => ({
  reportDate: text(row["通報日期"] ?? row.reportDate),
  alertLevel: text(row["預警水情"] ?? row.alertLevel),
  reservoirName: text(row["水庫名稱"] ?? row.reservoirName),
  supplyArea: text(row["供水區"] ?? row.supplyArea),
  title: text(row["標題"] ?? row.title),
});

/**
 * Runs the 水利署枯旱限水通報 sync.
 *
 * With no body, this host fetches the feed itself — which currently cannot
 * work: opendata.wra.gov.tw answers server-side requests with an F5 Shape
 * JavaScript challenge rather than JSON.
 *
 * With `{ records: [...] }`, the caller supplies bulletins it fetched
 * elsewhere. A GitHub Actions runner gets 200 from that same URL (measured via
 * .github/workflows/egress-probe.yml), so the daily job fetches there and posts
 * the rows here. Records are re-normalized and re-filtered on this side; the
 * runner is a transport, not a trusted source.
 *
 * Awaits its result rather than returning 202 like cwa-sync: this is one small
 * feed reduced to a row per reservoir, and returning the counts is what makes
 * the spec's manual verification steps possible.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => ({}))) as {
    records?: unknown;
  };

  let supplied: WraDroughtRecord[] | undefined;
  if (Array.isArray(body.records)) {
    supplied = body.records
      .filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null,
      )
      .map(toRecord)
      .filter(
        (record) => record.reservoirName !== "" && record.reportDate !== "",
      );

    if (supplied.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "records supplied but none had 水庫名稱 and 通報日期",
        },
        { status: 400 },
      );
    }
  }

  const result = await runWraDroughtSync(supplied);
  return NextResponse.json(
    { ok: result.error === null, source: supplied ? "runner" : "host", result },
    { status: result.error === null ? 200 : 502 },
  );
}
