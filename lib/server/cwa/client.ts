import { httpGetText } from "@/lib/server/net/httpClient";

const BASE_URL = "https://opendata.cwa.gov.tw/api";

/**
 * Fetches one CWA (中央氣象署) open-data dataset by resource ID.
 * https://opendata.cwa.gov.tw/dist/opendata-swagger.html
 */
export async function fetchCwaDataset<T = unknown>(resourceId: string, params: Record<string, string> = {}): Promise<T> {
  const apiKey = process.env.CWA_API_KEY;
  if (!apiKey) throw new Error("CWA_API_KEY is not configured");

  const query = new URLSearchParams({ Authorization: apiKey, ...params });
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(`${BASE_URL}/v1/rest/datastore/${resourceId}?${query.toString()}`);
  if (status < 200 || status >= 300) throw new Error(`CWA dataset ${resourceId} request failed: HTTP ${status}`);

  const json = JSON.parse(text);
  if (json.success !== "true" && json.success !== true) {
    throw new Error(`CWA dataset ${resourceId} returned an error: ${JSON.stringify(json).slice(0, 300)}`);
  }
  // `records` is a sibling of `result` at the JSON root ({success, result:
  // {resource_id, fields}, records: {...actual data...}}), not nested inside
  // `result` — easy to misread since `result.fields` (the column schema) and
  // `records` (the data) sit right next to each other in the response.
  return json.records as T;
}
