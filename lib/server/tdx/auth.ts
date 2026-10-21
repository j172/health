import "server-only";
import { httpRequest } from "@/lib/server/net/httpClient";
import { describeTokenFailure, nextTokenFailureLogAt } from "@/lib/server/tdx/tokenDiagnostics";
import { tdxCircuitBreaker } from "@/lib/server/tdx/circuitBreaker";

interface TdxTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

let lastTokenFailureLoggedAtMs = 0;

/** One throttled line per 10 minutes: HTTP status + OAuth error fields only (never the request form, never secrets). */
function logTokenFailure(detail: string): void {
  const next = nextTokenFailureLogAt(lastTokenFailureLoggedAtMs, Date.now());
  if (next === null) return;
  lastTokenFailureLoggedAtMs = next;
  console.warn(`TDX token request rejected: ${detail}`);
}

// Shared OAuth2 client-credentials token cache for every TDX API consumer in
// this repo (the Senior/Rail accessibility, bus and tourism
// clients all call getTdxToken() below) — extracted from the first TDX client
// (issue #434) so the callers share one cached token instead of each
// maintaining its own cache and all hitting the token endpoint.
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * 取得 TDX 存取權杖 (OAuth2 Client Credentials)。讀取 TDX_CLIENT_ID/TDX_APP_ID +
 * TDX_CLIENT_SECRET/TDX_APP_KEY（兩種命名皆支援，沿用既有慣例）。回傳 null 表示
 * 未設定憑證或權杖請求失敗，呼叫端應視為「無法使用 TDX」並走各自的降級路徑。
 */
export async function getTdxToken(): Promise<string | null> {
  const clientId = process.env.TDX_CLIENT_ID || process.env.TDX_APP_ID;
  const clientSecret = process.env.TDX_CLIENT_SECRET || process.env.TDX_APP_KEY;

  if (!clientId || !clientSecret) {
    return null;
  }

  // 斷路器開啟（或已有一個探測請求在途）時完全不碰 TDX，連快取中的 token 也不給——呼叫端本來
  // 就會走「token 取不到」的降級路徑（circuitBreaker.ts）。
  if (tdxCircuitBreaker.isBlocked()) return null;

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const gate = tdxCircuitBreaker.acquire();
  if (gate === "blocked") return null;

  try {
    // Raw httpRequest instead of httpPostForm: httpPostForm JSON.parses the body
    // and throws on a non-JSON error page, which hid the HTTP status entirely.
    const form = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString();
    const res = await httpRequest(
      "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": String(Buffer.byteLength(form)),
        },
        body: form,
        timeoutMs: 8000,
      }
    );
    const bodyText = res.buffer.toString("utf-8");

    let data: Partial<TdxTokenResponse> | null = null;
    try {
      data = JSON.parse(bodyText) as Partial<TdxTokenResponse>;
    } catch {
      data = null;
    }

    if (res.status === 200 && data?.access_token) {
      cachedToken = data.access_token;
      // 提早 60 秒到期，確保安全邊界
      tokenExpiresAt = now + Math.max(0, ((data.expires_in ?? 0) - 60) * 1000);
      tdxCircuitBreaker.settleTokenRequest(gate, { ok: true, httpStatus: res.status });
      return cachedToken;
    }
    tdxCircuitBreaker.settleTokenRequest(gate, { ok: false, httpStatus: res.status });
    logTokenFailure(describeTokenFailure(res.status, bodyText));
    return null;
  } catch (err) {
    tdxCircuitBreaker.settleTokenRequest(gate, { ok: false, httpStatus: null });
    console.warn("TDX token fetch failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
