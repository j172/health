import "server-only";
import https from "node:https";
import http from "node:http";

export interface GovFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
  json: <T = any>() => Promise<T>;
}

/**
 * Fetch helper for Taiwan government open data endpoints (e.g. MOICA/GRCA certificates)
 * where default Node.js root CAs may throw UNABLE_TO_VERIFY_LEAF_SIGNATURE.
 */
export function fetchGovData(url: string, headers?: Record<string, string>): Promise<GovFetchResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith("https://");
    const client = isHttps ? https : http;
    const options: https.RequestOptions = {
      rejectUnauthorized: false,
      headers: {
        "User-Agent": "j172-health-sync/1.0",
        ...(headers || {}),
      },
    };

    const req = client.get(url, options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const textContent = buffer.toString("utf-8");
        const status = res.statusCode || 200;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          statusText: res.statusMessage || "",
          text: () => Promise.resolve(textContent),
          json: <T = any>() => Promise.resolve(JSON.parse(textContent) as T),
        });
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.setTimeout(30000, () => {
      req.destroy(new Error(`Request timed out after 30s: ${url}`));
    });
  });
}
