# 修法：/llms.txt 格式不符合 llmstxt.org 規範（Lighthouse Agentic Browsing 扣分）

- **Type**: Bug fix / spec compliance.
- **Affects**: `app/llms.txt/route.ts`
- **來源**：2026-09-14 使用者手動跑 PageSpeed Insights，Lighthouse「Agentic Browsing」分類
  mobile 1/3、desktop 2/3，扣分項目：`llms.txt is not well-formed`、
  `llms.txt does not follow recommendations`。

## 1. 背景

`app/llms.txt/route.ts` 動態產生 `/llms.txt`（給 LLM/AI agent 讀的站點索引），但目前的輸出
結構不符合 [llmstxt.org](https://llmstxt.org/) 的規範文法。規範要求：

- H1：站台名稱
- 一段 blockquote 摘要
- 可選的補充說明段落
- 之後每個 H2 區塊底下，**每個項目是一行 markdown 連結清單**：
  `- [連結文字](url): 選填的簡短備註`

現況（`route.ts:48-59`、`63-74`）卻是：

```
### 中油加油站服務據點地圖
- URL: https://health.j172.tw/tools/cpc-stations
- 核心定義 (Direct Answer): ...
- 權威依據: ...
```

每個工具/新聞項目用 **H3 標題 + 好幾行獨立 bullet**（`- URL:`、`- 核心定義:`、`- 權威依據:`）
表示，而不是規範要求的單行 `- [名稱](url): 備註` 連結清單格式。這正是 Lighthouse 判定
「not well-formed」「does not follow recommendations」的原因。

本站另外有 `app/llms-full.txt` 承載更完整的細節資訊（公式、權威依據等），所以 `/llms.txt`
本身可以放心精簡成規範要求的輕量索引格式，不用擔心資訊遺失——詳細內容本來就該引導 agent
去讀 `/llms-full.txt` 或該工具自己的頁面。

## 2. 修法

1. 讀取 [llmstxt.org](https://llmstxt.org/) 的完整規範（用 WebFetch 實際查證文法，不要憑印象），
   確認：H1/blockquote/H2/連結清單各自的確切格式要求、是否有其他 Lighthouse 特別在意的細節
   （例如檔案必須是 `text/markdown` 還是 `text/plain`、是否要求檔案開頭第一行必須是 H1 等）。
2. 改寫 `app/llms.txt/route.ts` 第 48-59 行（工具清單）與第 63-74 行（新聞清單），把每個項目
   從「H3 + 多行 bullet」改成規範要求的單行連結清單格式，例如：
   ```
   - [中油加油站服務據點地圖](https://health.j172.tw/tools/cpc-stations): 整合全台 600 多座
     自營與加盟站點，支援洗車/充換電/打氣加水等服務即時篩選與導航。
   ```
   備註內容用 `tool.directAnswer`（工具）或 `geo_summary`/`meta_description`（新聞）擇一
   精簡呈現，公式/權威依據等細節資訊不用塞進 `/llms.txt`（留給 `/llms-full.txt`）。
3. 確認現有的「系統端點與導航」「多語言支援」兩個 H2 區塊（`route.ts:30-42`）目前用的
   `- 標籤: url` 格式是否也不符規範（規範要求連結必須用 markdown link 語法 `[text](url)`
   而非純文字後面接冒號跟裸網址），若不符合一併修正成 `- [標籤](url)` 格式。
4. 改完後實際打開 `/llms.txt`（本機或部署後的正式站皆可)驗證輸出格式，並可參考其他知名網站
   公開的 `/llms.txt` 範例（如 llmstxt.org 自己列出的範例站台）比對格式是否一致。

## 3. 驗收

- 改寫後的 `/llms.txt` 內容結構符合 llmstxt.org 規範（H1 → blockquote → H2 → 單行連結清單）。
- 不影響 `/llms-full.txt`、`/llm-info` 頁面內容（範圍只在 `/llms.txt` 這個 route）。
- 現有測試（若有涵蓋這個 route）維持通過；`npm run build` 正常。
- 建議在 PR 描述中提醒使用者：修完後可以重新用 PageSpeed Insights 或
  https://pagespeed.web.dev/ 驗證「Agentic Browsing」分類分數是否回升，但這一步不強制
  subagent 自己去跑（不用連正式站量測，只需確保格式正確）。

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
