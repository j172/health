import "server-only";
import { httpPostForm } from "@/lib/server/net/httpClient";

interface TdxTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// Shared OAuth2 client-credentials token cache for every TDX API consumer in
// this repo (YouBike's lib/server/youbike/tdxClient.ts and the Senior/Rail
// accessibility client both call getTdxToken() below) — extracted from
// tdxClient.ts (issue #434) so the two callers share one cached token instead
// of each maintaining its own cache and both hitting the token endpoint.
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

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  try {
    const res = await httpPostForm<TdxTokenResponse>(
      "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token",
      {
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      },
      { timeoutMs: 8000 }
    );

    if (res.status === 200 && res.data?.access_token) {
      cachedToken = res.data.access_token;
      // 提早 60 秒到期，確保安全邊界
      tokenExpiresAt = now + Math.max(0, (res.data.expires_in - 60) * 1000);
      return cachedToken;
    }
    return null;
  } catch (err) {
    console.warn("TDX token fetch failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
