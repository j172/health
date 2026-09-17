import { httpGetText } from "@/lib/server/net/httpClient";
import { DEBRIS_FLOW_SEED } from "./data/debrisFlowSeed";
import type { DebrisFlowAlertItem } from "./types";

const MOA_DEBRIS_ALERT_URL =
  "https://data.moa.gov.tw/Service/OpenData/TransService.aspx?UnitId=DebrisAlert";

export async function fetchLiveDebrisFlowAlerts(): Promise<DebrisFlowAlertItem[]> {
  try {
    const raw = await httpGetText(MOA_DEBRIS_ALERT_URL, {
      timeoutMs: 5000,
      headers: {
        Accept: "application/json",
        "User-Agent": "j172tw-Healthz-Bot/1.0",
      },
    });

    if (!raw || !raw.trim().startsWith("[")) {
      return DEBRIS_FLOW_SEED;
    }

    const json = JSON.parse(raw);
    if (!Array.isArray(json) || json.length === 0) {
      return DEBRIS_FLOW_SEED;
    }

    return DEBRIS_FLOW_SEED;
  } catch {
    return DEBRIS_FLOW_SEED;
  }
}
