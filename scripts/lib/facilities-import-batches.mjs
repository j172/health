// Shared by the "residential-network manual import" scripts that POST facility records to
// /api/admin/facilities-import (first user: scripts/import-police-stations-5958.mjs, #677).
//
// What scripts/import-mohw-ltc-gis.mjs learned the hard way (2026-10-15: batch 5/8 failed
// twice in a row) is kept here: the production host occasionally answers a batch with a
// transient HTML 502/504 page (noisy-neighbour contention, see
// docs/domains/11-hosting-ops-incidents.md) instead of JSON. Without a retry one blip
// aborted the run and left the remaining batches unsent. Network errors and non-JSON
// bodies are retried with exponential back-off; only a real application-level failure
// (valid JSON with ok:false) stops immediately.
//
// The admin secret goes only into the request header. It is never logged and never put in
// an error message.

const REQUEST_TIMEOUT_MS = 90_000;
// Cloudflare's JS-challenge page is tens of KB on one line; keep error text legible.
const MAX_ERROR_BODY_PREVIEW = 300;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} opts
 * @param {string} opts.baseUrl
 * @param {string} opts.adminSecret       value of the x-rss-sync-admin-secret header
 * @param {object[]} opts.records         FacilityRecord[]
 * @param {number} [opts.batchSize=2000]  records per request (a 1,687-row snapshot is one request)
 * @param {string|null} [opts.cleanFacilityType]  asks the route to delete every row of this
 *        facility_type before upserting; sent on the FIRST batch only
 * @param {number} [opts.maxRetries=4]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {(ms:number)=>Promise<void>} [opts.sleepImpl]
 * @param {(msg:string)=>void} [opts.log]
 * @returns {Promise<{batches:number, inserted:number, updated:number, deleted:number}>}
 */
export async function submitFacilityBatches({
  baseUrl,
  adminSecret,
  records,
  batchSize = 2000,
  cleanFacilityType = null,
  maxRetries = 4,
  fetchImpl = fetch,
  sleepImpl = defaultSleep,
  log = console.log,
}) {
  if (!adminSecret) throw new Error("Missing admin secret (set the ADMIN_SECRET environment variable)");
  if (!Array.isArray(records) || records.length === 0) throw new Error("There are no records to import");

  const totals = { batches: 0, inserted: 0, updated: 0, deleted: 0 };
  const totalBatches = Math.ceil(records.length / batchSize);

  for (let start = 0; start < records.length; start += batchSize) {
    const payload = { records: records.slice(start, start + batchSize) };
    if (start === 0 && cleanFacilityType) payload.cleanFacilityType = cleanFacilityType;
    const batchNumber = totals.batches + 1;

    log(`Submitting batch ${batchNumber}/${totalBatches} (${payload.records.length} records)...`);
    const json = await postBatch({ baseUrl, adminSecret, payload, maxRetries, fetchImpl, sleepImpl, log });

    totals.batches++;
    totals.inserted += json.inserted || 0;
    totals.updated += json.updated || 0;
    totals.deleted += json.deleted || 0;
    log(
      `  Batch ${batchNumber} done: inserted=${json.inserted || 0} updated=${json.updated || 0}${json.deleted ? ` deleted=${json.deleted}` : ""}`,
    );
  }
  return totals;
}

async function postBatch({ baseUrl, adminSecret, payload, maxRetries, fetchImpl, sleepImpl, log }) {
  for (let attempt = 0; ; attempt++) {
    const backoffMs = 2000 * 2 ** attempt;
    let res;
    let text;
    try {
      res = await fetchImpl(`${baseUrl}/api/admin/facilities-import`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-rss-sync-admin-secret": adminSecret },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      text = await res.text();
    } catch (networkError) {
      if (attempt >= maxRetries) throw new Error(`Import batch failed after ${attempt + 1} attempts: ${networkError.message}`);
      log(`  Batch request failed (${networkError.message}), retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await sleepImpl(backoffMs);
      continue;
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      // Non-JSON body = an HTML error page from the proxy/host, not a real application response.
      if (attempt >= maxRetries) {
        const preview = text.length > MAX_ERROR_BODY_PREVIEW ? `${text.slice(0, MAX_ERROR_BODY_PREVIEW)}... (${text.length} bytes)` : text;
        throw new Error(`Import batch failed: HTTP ${res.status}, non-JSON body: ${preview}`);
      }
      log(`  Batch got non-JSON HTTP ${res.status} response, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await sleepImpl(backoffMs);
      continue;
    }

    if (!res.ok || !json.ok) throw new Error(`Import batch failed: HTTP ${res.status} ${JSON.stringify(json)}`);
    return json;
  }
}
