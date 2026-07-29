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

  let json: { success?: unknown; result?: { records?: unknown } };
  try {
    json = JSON.parse(text);
  } catch (error) {
    console.error(`CWA dataset ${resourceId}: JSON.parse failed, length=${text.length}, head=${text.slice(0, 200)}`);
    throw error;
  }
  if (json.success !== "true" && json.success !== true) {
    throw new Error(`CWA dataset ${resourceId} returned an error: ${JSON.stringify(json).slice(0, 300)}`);
  }
  if (json.result?.records === undefined) {
    console.error(`CWA dataset ${resourceId}: no records field, length=${text.length}, keys=${Object.keys(json)}, resultKeys=${json.result ? Object.keys(json.result) : "no result"}, head=${text.slice(0, 300)}`);
  }
  return json.result?.records as T;
}
