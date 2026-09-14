# 匯入腳本導入 Zod schema 驗證（item 5a 高優先建議）

- **Type**: 資料正確性強化，非新功能。
- **來源**：`docs/specs/free-tier-tooling-recommendations-20260914.md` §2 建議 1（優先級：高）
- **Affects**: `package.json`（新增 zod 依賴）、`scripts/import-*.mjs`、`lib/server/facilities/sources/*.ts`
  等從政府 open data 讀取遠端資料的匯入邏輯

## 1. 背景

本站架構是「政府 open data → Node.js/TypeScript 排程腳本 → MySQL」，`package.json` 目前
完全沒有任何 schema 驗證函式庫（zod/ajv/joi/yup 皆無）。本站已多次因「上游政府資料集欄位
悄悄改變」踩雷（過去的 `mol-occupational-injury-source-id-migration.md`、
`drug-label-source-blocked.md` 等既有 spec 都記錄過類似事故），目前的防護仰賴人工撰寫的
欄位對應與 `ingest_runs`/`ingest_errors` 記錄表，屬於「錯了才知道」而非「錯了立刻擋下來」。

## 2. 修法

1. 新增 `zod` 作為正式依賴（完全免費、開源、TypeScript 原生，零基礎設施成本）。
2. **不要求一次改完全部匯入腳本**——選擇最近半年內曾經因欄位變更出過事故的幾個資料源
   （搜尋 `docs/specs/` 裡跟 source migration/blocked 相關的既有文件找出候選）優先加上
   schema 驗證，作為示範與立即見效的防護；其餘資料源可以在 PR 描述中列出建議之後比照辦理的
   清單，不用強求一次全部覆蓋。
3. 每個加上驗證的匯入點，設計方式是：抓到遠端資料後，立即用一個 zod schema 驗證關鍵欄位
   是否還存在、型別是否吻合；驗證失敗時明確記錄到 `ingest_errors`（或既有的錯誤記錄機制），
   而不是讓錯誤資料靜默寫入資料庫，也不是讓既有的 try/catch 吞掉錯誤訊息不留痕跡。
4. 確認新增的驗證邏輯不會讓既有正常運作的匯入流程出現誤判（schema 定義要對照實際欄位，不要
   憑猜測寫過嚴的規則導致正常資料被擋下）。

## 3. 驗收

- `package.json` 新增 zod 依賴。
- 至少 2-3 個匯入腳本/資料源加上 schema 驗證，PR 描述說明選了哪些、為什麼選這些。
- `npm run build`、既有測試維持通過。
- PR 描述附上「建議後續比照辦理」的其餘資料源清單（不用實作，列出來即可）。

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
