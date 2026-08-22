import "server-only";
import { createHash } from "node:crypto";
import { httpGetText } from "@/lib/server/net/httpClient";
import { env } from "@/lib/server/config/env";
import type { CwaAlertRecord } from "@/lib/server/cwa/queries";

/**
 * 環境部沙塵事件訊息 (sandst_p_01) as alert rows.
 *
 * Folded into cwa_alerts alongside CWA's own bulletins so the 即時氣象警報 block
 * keeps one query and one render path. `datasetId` is what distinguishes them —
 * see listActiveCwaAlerts.
 *
 * These carry a publish time and nothing else: no severity, no expiry, no
 * cancellation bulletin. So severity is inferred from the wording (MOENV states
 * plainly when there is no significant impact) and expiry is left null, which
 * puts them under the seven-day fallback — the right treatment for a bulletin
 * that never announces its own end.
 */

const DATASET_ID = "sandst_p_01";

interface RawDustRow {
  publishtime?: string;
  subject?: string;
  content?: string;
}

const text = (value: unknown): string =>
  value == null ? "" : String(value).trim();

const toSqlUtc = (value: string): string | null => {
  if (!value) return null;
  // MOENV publishes local Taipei time with no offset marker.
  const date = new Date(`${value.replace(" ", "T")}+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
};

/**
 * MOENV writes the outcome into the subject line itself — "對臺灣無顯著影響"
 * versus wording about arriving dust raising concentrations. Reading that is
 * more honest than labelling every bulletin identically.
 */
const severityFor = (subject: string, content: string): string => {
  const body = `${subject} ${content}`;
  if (/無顯著影響|無影響|影響不明顯/.test(body)) return "Minor";
  if (/嚴重|紅色|危害|大量/.test(body)) return "Severe";
  if (/影響|濃度上升|來襲|挾帶/.test(body)) return "Moderate";
  return "Minor";
};

export async function fetchMoenvDustStorms(): Promise<CwaAlertRecord[]> {
  const apiKey = env.moenvNewsApiKey;
  if (!apiKey) throw new Error("No MOENV API key is configured");

  const query = new URLSearchParams({
    api_key: apiKey,
    limit: "20",
    sort: "ImportDate desc",
    format: "JSON",
  });

  const { status, text: body } = await httpGetText(
    `https://data.moenv.gov.tw/api/v2/${DATASET_ID}?${query.toString()}`,
    { timeoutMs: 20_000, headers: { Accept: "application/json" } },
  );
  if (status < 200 || status >= 300) {
    throw new Error(`MOENV ${DATASET_ID} request failed: HTTP ${status}`);
  }

  const parsed = JSON.parse(body) as unknown;
  const rows: RawDustRow[] = Array.isArray(parsed)
    ? (parsed as RawDustRow[])
    : (((parsed as { records?: RawDustRow[] })?.records ?? []) as RawDustRow[]);

  const out: CwaAlertRecord[] = [];
  for (const row of rows) {
    const subject = text(row.subject);
    const publishTime = text(row.publishtime);
    if (!subject || !publishTime) continue;

    const content = text(row.content);
    const effective = toSqlUtc(publishTime);

    out.push({
      alertKey: createHash("sha256")
        .update(`${DATASET_ID}|${subject}|${publishTime}`)
        .digest("hex"),
      datasetId: DATASET_ID,
      event: "沙塵事件",
      headline: subject,
      description: content && content !== subject ? content : null,
      instruction: null,
      severity: severityFor(subject, content),
      urgency: "Expected",
      certainty: "Observed",
      areaDesc: "全臺",
      effective,
      onset: effective,
      // MOENV never issues a cancellation, so there is nothing honest to put
      // here; listActiveCwaAlerts' seven-day fallback bounds it instead.
      expires: null,
      web: "https://airtw.moenv.gov.tw/",
    });
  }

  return out;
}
