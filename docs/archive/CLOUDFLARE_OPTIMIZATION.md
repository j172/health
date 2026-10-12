# Cloudflare Free 方案全方位優化實施手冊

本文件記錄專為 **Next.js 16 + React 19 + PM2 + cPanel/CloudLinux** 架構量身定制的 Cloudflare Free 方案完整配置手冊。

---

## 1. DNS 與 SSL/TLS 基礎設定

### 1.1 DNS 設定
- **主網域 (Apex / `@`) 與 `www`**：將 Proxy status 設定為 **Proxied（橘色雲朵 ☁️）**。
- **DNSSEC**：至 `DNS` -> `Settings` -> 開啟 **Enable DNSSEC**，並依照提供的 DS 記錄至網域名稱註冊商（Domain Registrar）完成設定。

### 1.2 SSL/TLS 加密模式
- **路徑**：`SSL/TLS` -> `Overview`
- **加密模式**：選擇 **Full (Strict)**。

### 1.3 Edge Certificates 設定
- **路徑**：`SSL/TLS` -> `Edge Certificates`
- **Always Use HTTPS**：`ON`
- **Automatic HTTPS Rewrites**：`ON`
- **Minimum TLS Version**：`TLS 1.2`
- **Opportunistic Encryption**：`ON`
- **TLS 1.3**：`ON`

### 1.4 來源伺服器憑證 (Origin CA)
- **路徑**：`SSL/TLS` -> `Origin Server` -> `Create Certificate`
- 產出 15 年期免費憑證與私鑰，部署至 cPanel 的 **SSL/TLS 管理器**（或使用 Let's Encrypt 自動續期憑證）。

---

## 2. 快取與分層快取（Cache Rules & Tiered Cache）

### 2.1 Tiered Cache（分層快取）
- **路徑**：`Caching` -> `Tiered Cache`
- **Smart Tiered Cache Topology**：`ON`（自動透過中心拓撲匯總邊緣回源請求，大幅減輕主機 PM2 負載）。

### 2.2 Crawler Hints
- **路徑**：`Caching` -> `Configuration`
- **Crawler Hints**：`ON`（整合 IndexNow 自動向 Bing / Yandex 等搜尋引擎提交通知）。

### 2.3 Cache Rules（快取規則設定）
至 `Caching` -> `Cache Rules` 建立以下規則（依優先順序排序）：

#### 規則 1：管理後台完全繞過快取 (Bypass Admin)
* **Rule name**：`Bypass Cache for Admin & Admin APIs`
* **When incoming requests match**：
  ```
  (http.request.uri.path starts_with "/admin") or (http.request.uri.path starts_with "/api/admin")
  ```
* **Then**：
  * **Cache eligibility**：`Bypass cache`

#### 規則 2：靜態資源長效快取 (Static Assets)
* **Rule name**：`Cache Static Assets`
* **When incoming requests match**：
  ```
  (http.request.uri.path starts_with "/_next/static/") or (http.request.uri.path starts_with "/images/") or (http.request.uri.path eq "/favicon.ico")
  ```
* **Then**：
  * **Cache eligibility**：`Eligible for cache`
  * **Edge TTL**：`Respect origin`（遵循 Next.js 提供的 1 年 immutable 標頭）
  * **Browser TTL**：`Respect origin`

#### 規則 3：公開 HTML 頁面邊緣快取 (HTML Edge Cache)
* **Rule name**：`Respect Origin for Public HTML & SWR`
* **When incoming requests match**：
  ```
  not (http.request.uri.path starts_with "/admin") and not (http.request.uri.path starts_with "/api/admin")
  ```
* **Then**：
  * **Cache eligibility**：`Eligible for cache`
  * **Edge TTL**：`Respect origin`（自動遵循 Next.js 的 `s-maxage=60, stale-while-revalidate=600`）

---

## 3. 傳輸加速與協議優化（Speed & Protocols）

### 3.1 協定與網路連線
- **路徑**：`Speed` -> `Optimization` -> `Protocol Optimization`
  - **HTTP/3 (with QUIC)**：`ON`
  - **0-RTT Connection Resumption**：`ON`
  - **gRPC**：`ON`
  - **WebSockets**：`ON`
- **路徑**：`Speed` -> `Optimization` -> `Content Optimization`
  - **Brotli**：`ON`
  - **Early Hints**：`ON`
  - **Rocket Loader**：⚠️ **`OFF`（必須關閉，避免破壞 React 19 Hydration）**
  - **Auto Minify**：**`OFF`（由 Next.js 編譯負責）**

---

## 4. 安全性、WAF 與頻率限制（Security & WAF）

### 4.1 Bot 防護
- **路徑**：`Security` -> `Bots`
- **Bot Fight Mode**：`ON`

### 4.2 WAF 自訂規則（Custom Rules）
- **路徑**：`Security` -> `WAF` -> `Custom rules`

#### 規則 1：管理後台智慧挑戰
* **Rule name**：`Challenge Untrusted Traffic on Admin`
* **Expression**：
  ```
  (http.request.uri.path starts_with "/admin" or http.request.uri.path starts_with "/api/admin") and (cf.threat_score gt 0 or not ip.geoip.country in {"TW"})
  ```
* **Action**：`Managed Challenge`

#### 規則 2：阻擋高威脅連線
* **Rule name**：`Block High Threat Score`
* **Expression**：
  ```
  cf.threat_score ge 15
  ```
* **Action**：`Block`

### 4.3 速率限制（Rate Limiting）
- **路徑**：`Security` -> `WAF` -> `Rate limiting rules`
* **Rule name**：`Protect API & Login Rate Limits`
* **Expression**：
  ```
  http.request.uri.path starts_with "/api/" or http.request.uri.path starts_with "/admin"
  ```
* **Rate**：`30 requests per 10 seconds`
* **Action**：`Managed Challenge`（封鎖時長：60 秒）

---

## 5. 邊緣轉換規則（Transform Rules & Redirects）

### 5.1 規範網域 301 重定向（Redirect Rules）
- **路徑**：`Rules` -> `Redirect Rules`
* **Rule name**：`Redirect www to apex (or vice versa)`
* **Expression**：
  ```
  http.host eq "www.yourdomain.com"
  ```
* **Type**：`Dynamic`
* **Target URL Expression**：
  ```
  concat("https://yourdomain.com", http.request.uri.path)
  ```
* **Status code**：`301`

### 5.2 邊緣安全標頭注入（Transform Rules - Modify Response Header）
- **路徑**：`Rules` -> `Transform Rules` -> `Modify Response Header`
* **Rule name**：`Security & Privacy Headers`
* **When incoming requests match**：`All incoming requests`
* **Headers to set / remove**：
  - **Set static**：`X-Content-Type-Options` = `nosniff`
  - **Set static**：`X-Frame-Options` = `SAMEORIGIN`
  - **Set static**：`Referrer-Policy` = `strict-origin-when-cross-origin`
  - **Set static**：`Permissions-Policy` = `camera=(), microphone=(), geolocation=(self)`
  - **Remove**：`Server`
  - **Remove**：`X-Powered-By`

---

## 6. 分析與效能驗證指令

### 6.1 啟用 Web Analytics
- **路徑**：`Analytics & Logs` -> `Web Analytics`
- 點擊 **Add Site**，啟用免 Cookie、不影響載入速度的真實訪客與 Core Web Vitals 指標追蹤。

### 6.2 終端機驗證指令

```bash
# 1. 檢驗 Cloudflare 快取狀態（預期出現 CF-Cache-Status: HIT / STALE / REVALIDATED）
curl -I https://yourdomain.com/

# 2. 檢驗 Brotli 壓縮是否生效
curl -I -H "Accept-Encoding: br" https://yourdomain.com/ | grep "content-encoding"

# 3. 檢驗安全標頭與隱藏伺服器指紋
curl -I https://yourdomain.com/ | grep -E "x-content-type-options|x-frame-options|referrer-policy|server|x-powered-by"

# 4. 檢驗後台是否維持 no-store 快取繞過
curl -I https://yourdomain.com/admin/
```
