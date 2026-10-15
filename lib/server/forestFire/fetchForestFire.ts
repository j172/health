import "server-only";
import { httpGetText } from "@/lib/server/net/httpClient";
import { buildForestFireUrl } from "./parse";

/**
 * Fetches the MOA ForestFireAlertWCF feed for one Asia/Taipei date and returns
 * the decoded JSON (validation/parsing is parseForestFire's job).
 *
 * Egress note (spec section 3): data.moa.gov.tw is already used by production
 * sources (pest alerts, debris flow), but this `/api/v1/` path has not been
 * individually probed from the production host. The first live sync after
 * deploy is the check (see the PR's post-deploy TODOs); a block would surface
 * as a failed run in ingest_runs / ingest_errors, never as an empty page.
 *
 * Uses the shared node:http(s) client, never the global fetch() (spec section 4
 * item 6: undici's WASM parser OOMs under this host's `ulimit -v`).
 */
export const fetchForestFireJson = async (today: string): Promise<unknown> => {
  const url = buildForestFireUrl(today);
  const res = await httpGetText(url, {
    timeoutMs: 20_000,
    headers: {
      Accept: "application/json",
      "User-Agent": "j172tw-Healthz-Bot/1.0",
    },
  });

  if (res.status !== 200) {
    throw new Error(`ForestFireAlertWCF returned HTTP ${res.status}`);
  }

  try {
    return JSON.parse(res.text);
  } catch {
    throw new Error("ForestFireAlertWCF returned a non-JSON body");
  }
};
