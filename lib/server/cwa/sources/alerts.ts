import { createHash } from "node:crypto";
import { fetchCwaDataset } from "@/lib/server/cwa/client";
import type { CwaAlertRecord } from "@/lib/server/cwa/queries";

// CAP-format (Common Alerting Protocol) hazard bulletins — same shape across
// all four, but typhoon (W-C0034-001) sometimes nests `description` as
// {section:[...]} instead of a plain string, and reports `area[]` instead of
// a single `areaDesc` string; both are handled defensively below rather than
// giving typhoon its own parser, since everything else about the shape (and
// the destination table) is identical.
const RESOURCE_IDS = ["W-C0033-003", "W-C0033-004", "W-C0033-005", "W-C0034-001"];

interface RawArea {
  areaDesc?: string;
}

interface RawDescriptionSection {
  title?: string;
  value?: string;
}

interface RawInfo {
  event?: string;
  headline?: string;
  description?: string | { section?: RawDescriptionSection[] };
  instruction?: string;
  severity?: string;
  urgency?: string;
  certainty?: string;
  areaDesc?: string;
  area?: RawArea[];
  effective?: string;
  onset?: string;
  expires?: string;
  web?: string;
}

interface RawRecords {
  info: RawInfo[];
}

const flattenDescription = (description: RawInfo["description"]): string | null => {
  if (!description) return null;
  if (typeof description === "string") return description;
  if (description.section) {
    return description.section
      .map((s) => (s.title && s.value ? `${s.title}：${s.value}` : s.value || s.title || ""))
      .filter(Boolean)
      .join("\n");
  }
  return null;
};

const resolveAreaDesc = (info: RawInfo): string | null => {
  if (info.areaDesc) return info.areaDesc;
  if (info.area && info.area.length > 0) return info.area.map((a) => a.areaDesc).filter(Boolean).join("、");
  return null;
};

const buildAlertKey = (datasetId: string, event: string, areaDesc: string, effective: string): string =>
  createHash("sha256").update(`${datasetId}|${event}|${areaDesc}|${effective}`).digest("hex");

export async function fetchCwaAlerts(): Promise<CwaAlertRecord[]> {
  const rows: CwaAlertRecord[] = [];

  for (const resourceId of RESOURCE_IDS) {
    const records = await fetchCwaDataset<RawRecords>(resourceId);

    for (const info of records.info ?? []) {
      const event = info.event ?? "";
      const areaDesc = resolveAreaDesc(info) ?? "";
      const effective = info.effective ?? "";

      rows.push({
        alertKey: buildAlertKey(resourceId, event, areaDesc, effective),
        datasetId: resourceId,
        event: info.event ?? null,
        headline: info.headline ?? null,
        description: flattenDescription(info.description),
        instruction: info.instruction ?? null,
        severity: info.severity ?? null,
        urgency: info.urgency ?? null,
        certainty: info.certainty ?? null,
        areaDesc: resolveAreaDesc(info),
        effective: info.effective ?? null,
        onset: info.onset ?? null,
        expires: info.expires ?? null,
        web: info.web ?? null,
      });
    }
  }

  return rows;
}
