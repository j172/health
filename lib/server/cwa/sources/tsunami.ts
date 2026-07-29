import { fetchCwaDataset } from "@/lib/server/cwa/client";
import type { CwaTsunamiRecord } from "@/lib/server/cwa/queries";

// 海嘯資訊 (tsunami information/warnings)
const RESOURCE_ID = "E-A0014-001";

interface RawTsunami {
  IssueTime?: string;
  ValidTime?: { EndTime?: string };
  ReportColor?: string;
  ReportContent?: string;
  ReportNo?: string;
  ReportType?: string;
  Web?: string;
}

interface RawRecords {
  Tsunami: RawTsunami[];
}

export async function fetchCwaTsunamis(): Promise<CwaTsunamiRecord[]> {
  const records = await fetchCwaDataset<RawRecords>(RESOURCE_ID);

  return (records.Tsunami ?? [])
    .filter((t) => t.ReportNo)
    .map((t) => ({
      reportNo: t.ReportNo as string,
      reportType: t.ReportType ?? null,
      reportColor: t.ReportColor ?? null,
      issueTime: t.IssueTime ?? null,
      endTime: t.ValidTime?.EndTime ?? null,
      reportContent: t.ReportContent ?? null,
      web: t.Web ?? null,
    }));
}
