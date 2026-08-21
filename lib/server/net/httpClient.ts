import "server-only";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import zlib from "node:zlib";

/**
 * Plain node:http(s) client, deliberately avoiding the global fetch()/undici
 * path — undici lazily instantiates a WASM llhttp parser on first use, which
 * fails with "WebAssembly.instantiate(): Out of memory" on hosts with a low
 * `ulimit -v` (virtual memory) cap, such as this shared-hosting account.
 * Node's core http/https client uses the native (non-WASM) llhttp built into
 * the binary, so it isn't affected.
 */

// hpa.gov.tw serves its TLS chain without the TWCA intermediate certificate,
// so Node (which doesn't fetch missing intermediates via AIA like some curl
// builds do) fails with "unable to verify the first certificate". Trust it
// explicitly alongside Node's normal root store.
// Subject: C=TW, O=TAIWAN-CA, CN=TWCA Secure SSL Certification Authority
// Issuer: TWCA Global Root CA — https://sslserver.twca.com.tw/cacert/secure_sha2_2023G3.crt
const TWCA_SECURE_SSL_INTERMEDIATE_CA = `-----BEGIN CERTIFICATE-----
MIIFxjCCA66gAwIBAgIQQAE0s2gAAAAAAAAM0KoI7DANBgkqhkiG9w0BAQsFADBR
MQswCQYDVQQGEwJUVzESMBAGA1UEChMJVEFJV0FOLUNBMRAwDgYDVQQLEwdSb290
IENBMRwwGgYDVQQDExNUV0NBIEdsb2JhbCBSb290IENBMB4XDTIzMTAxNjA5MDEw
NFoXDTMwMTAxNjE1NTk1OVowUzELMAkGA1UEBhMCVFcxEjAQBgNVBAoTCVRBSVdB
Ti1DQTEwMC4GA1UEAxMnVFdDQSBTZWN1cmUgU1NMIENlcnRpZmljYXRpb24gQXV0
aG9yaXR5MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyS5amjYQhd10
hZs00r7RXdI3ASka2AQmJnOyA6bqvAYOMlMECUdlsjDccdmMdHx8YTYYMtmCy+UB
RJZ/ytVANVQlfcUvXzWfauFs8XpCC/Th+Ed2tIEEGK218QsBebImAHPGDvp2Yglj
XVaQR/0FeN1lIzQ3iUkad0dCsC/bxFiWsmsjeSscTaxrYzHFADUhK0qj4W5PmOuw
lAR3C4XXgzPAI3V0qBpQ7sqgNLaNBFTZkP6AVryZC+DapfWBIMmIxIOg8g25MKb4
XvXkCLYKIxi8Djhv1zSmLLrKbQFZrjWlD/OWqInPPmSwBrKZ13EMQhoRRi1pXfN+
J2ugR/PUQQIDAQABo4IBljCCAZIwHwYDVR0jBBgwFoAUSNvN3o7pSXJaiOix2D0H
s7lrZlAwHQYDVR0OBBYEFJLn+mIWcYzzl3FCxgan4EZhS1y2MA4GA1UdDwEB/wQE
AwIBhjAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwSgYDVR0gBEMwQTA1
BgsrBgEEAYK/JQEBFTAmMCQGCCsGAQUFBwIBFhhodHRwczovL3d3dy50d2NhLmNv
bS50dy8wCAYGZ4EMAQICMEkGA1UdHwRCMEAwPqA8oDqGOGh0dHA6Ly9yb290Y2Eu
dHdjYS5jb20udHcvVFdDQVJDQS9nbG9iYWxfcmV2b2tlXzQwOTYuY3JsMBIGA1Ud
EwEB/wQIMAYBAf8CAQAwdgYIKwYBBQUHAQEEajBoMDwGCCsGAQUFBzAChjBodHRw
Oi8vc3Nsc2VydmVyLnR3Y2EuY29tLnR3L2NhY2VydC9yb290NDA5Ni5jcnQwKAYI
KwYBBQUHMAGGHGh0dHA6Ly9yb290b2NzcC50d2NhLmNvbS50dy8wDQYJKoZIhvcN
AQELBQADggIBADVzQW2rRsMiWoVrBdZX1BiOgN6B/Ryt2zpq8uRxFQspvGYfUVIm
4uU4AaPR7aQ5KwpKjDWv2ncvX2ssCY54B82g2mxEEVEdu5PFl0jkuk4LmPsClYZc
6J6odUbVI3wtv2yF6+fqQrO+gDhEIhlg3IqWICfiyJZS+p2TirMszGzs4a+K9tZX
rS2W/jKsSt4bSmcIzDpwm2gSaSuLDIAwq0WrD29kA7+N+rMMs4zBIVKyYm9r08q4
UOGU16J7mKBrF0KYDZFyT9Hq5HAX2uwYoQJxQ5Z0BR8eZH8AIIi2vsFC8pkv2ra1
2dldd3Pivm0mdratbn1Z6MQ71FKR9Ui3L8P+0xu8DkhhxE11Ogpl+aquBUqGcvlD
0SgpXy+eoeFaRhFXRUkWtH/3XYo+h+N+4jZmgjCLd4+YI+u5tbUGpyBMABmUDiqZ
xcrPGc4cvXExqYePUg6cFCDcjqGCxqSu5BPbA5R+DSTkn5Sc1WQzORJpD5b7pcEq
8msolev88dcmddLXMyWzXQfPHA4vaQD74lr5LIzn6BRjVv+ZB7Y0ZTnnOimDXxn7
Cxqd+1/8ldRis/tO/JWZsMm5ruvCppwCZUdXjSNI5R1OxzVwTVLzsCoiSYPV0agd
a5dQ9wayB6OohBK7+ZU2V3sZwE2xwHdDzfhbdzmI++TxtOurDHbkfkED
-----END CERTIFICATE-----`;

const TRUSTED_CAS = [...tls.rootCertificates, TWCA_SECURE_SSL_INTERMEDIATE_CA];

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRedirects?: number;
  body?: string;
  /**
   * Hard ceiling on the response body, in bytes. The socket is destroyed as soon
   * as the limit is passed, so an oversized or hostile response can never become
   * resident. Defaults to DEFAULT_MAX_RESPONSE_BYTES.
   *
   * This matters more here than on a normal host: production runs under a ~768MB
   * V8 heap cap, and every caller's own size check (MAX_IMAGE_BYTES and friends)
   * runs only *after* the full body has already been buffered.
   */
  maxResponseBytes?: number;
}

/** 24MB — comfortably above the largest article image we fetch, far below the heap cap. */
export const DEFAULT_MAX_RESPONSE_BYTES = 24 * 1024 * 1024;

export class ResponseTooLargeError extends Error {
  constructor(url: string, limit: number) {
    super(`Response body exceeded ${limit} bytes: ${url}`);
    this.name = "ResponseTooLargeError";
  }
}

export interface HttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  buffer: Buffer;
}

const decodeBody = (
  buffer: Buffer,
  contentEncoding: string | undefined,
): Buffer => {
  try {
    if (contentEncoding === "gzip") return zlib.gunzipSync(buffer);
    if (contentEncoding === "br") return zlib.brotliDecompressSync(buffer);
    if (contentEncoding === "deflate") return zlib.inflateSync(buffer);
  } catch {
    // Fall through and return the raw buffer if decompression fails.
  }
  return buffer;
};

const requestOnce = (
  url: string,
  options: HttpRequestOptions,
): Promise<HttpResponse> =>
  new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error(`Invalid URL: ${url}`));
      return;
    }

    const transport = parsed.protocol === "http:" ? http : https;
    const req = transport.request(
      parsed,
      {
        method: options.method ?? "GET",
        headers: {
          "Accept-Encoding": "gzip, deflate, br",
          // Cloudflare-fronted origins (Pixabay's CDN, in particular) rate-limit
          // or challenge requests with no User-Agent much more aggressively than
          // ones that look like a normal browser — confirmed live: the exact
          // same URL succeeded via curl (which sends a default UA) and failed
          // with HTTP 429 "Rate limit exceeded" via plain Node https without one.
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          ...options.headers,
        },
        timeout: options.timeoutMs ?? 15_000,
        ...(parsed.protocol === "https:" ? { ca: TRUSTED_CAS } : {}),
      },
      (res) => {
        const limit = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

        // Trust Content-Length when the origin sends one — this rejects an
        // oversized download before a single byte of it is buffered.
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > limit) {
          res.destroy();
          reject(new ResponseTooLargeError(url, limit));
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;
        let aborted = false;

        res.on("data", (chunk: Buffer) => {
          if (aborted) return;
          received += chunk.length;
          if (received > limit) {
            aborted = true;
            res.destroy();
            reject(new ResponseTooLargeError(url, limit));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (aborted) return;
          const raw = Buffer.concat(chunks);
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            buffer: decodeBody(raw, res.headers["content-encoding"]),
          });
        });
        res.on("error", (error) => {
          if (aborted) return;
          reject(error);
        });
      },
    );

    req.on("timeout", () =>
      req.destroy(new Error(`Request timed out: ${url}`)),
    );
    req.on("error", reject);

    if (options.body) req.write(options.body);
    req.end();
  });

export const httpRequest = async (
  url: string,
  options: HttpRequestOptions = {},
): Promise<HttpResponse> => {
  let currentUrl = url;
  let redirectsLeft = options.maxRedirects ?? 5;

  for (;;) {
    const response = await requestOnce(currentUrl, options);
    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);

    if (isRedirect && response.headers.location && redirectsLeft > 0) {
      currentUrl = new URL(response.headers.location, currentUrl).toString();
      redirectsLeft -= 1;
      continue;
    }

    return response;
  }
};

export const httpGetText = async (
  url: string,
  options: HttpRequestOptions = {},
): Promise<{ status: number; text: string }> => {
  const response = await httpRequest(url, options);
  return { status: response.status, text: response.buffer.toString("utf-8") };
};
