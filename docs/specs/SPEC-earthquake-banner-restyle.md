# 規格書：全站地震速報橫幅視覺樣式重構（比照颱風警報大卡片）

- **建立日期**：2026-10-24
- **狀態**：Ready for Implementation (`ready-for-agent`)
- **關聯 Ticket**：[`docs/specs/ticket-earthquake-banner-restyle.md`](ticket-earthquake-banner-restyle.md)
- **目標元件**：`components/Earthquake/EarthquakeBanner.tsx`
- **參照元件**：`components/Typhoon/TyphoonBanner.tsx`（issue #744）

---

## 1. Problem Statement

目前全站地震速報橫幅（`EarthquakeBanner.tsx`）使用緊貼頂部的滿版通欄橫幅（`w-full border-b px-4 py-2.5 text-sm`），而颱風警報橫幅（`TyphoonBanner.tsx`，issue #744）已經升級為現代化、高辨識度的懸浮大圓角卡片（`rounded-3xl`、`shadow-lg`、`sm:scale-[1.02]`、`text-3xl sm:text-4xl` Emoji、大標題字級）。

兩者在全站頂層災害通知中呈現不一致的視覺層次，且滿版通欄在行動端與大螢幕上的視覺衝擊力與閱讀層次不如圓角卡片。使用者期望地震速報橫幅的樣式比照颱風警報橫幅升級。

---

## 2. Solution & Design Decisions (Grill Me 結論)

經由 Grill Me 決策流程，本規格確認以下設計決策：

1. **外層懸浮容器架構**：
   - 放棄滿版 `w-full border-b`，改採颱風橫幅同款懸浮容器：
     `className="mx-auto max-w-5xl px-4 pt-3 sm:px-6 sm:pt-4 lg:px-8"`
   - 保持無障礙與自動化測試契約屬性：`role="status"`、`aria-label`、`data-earthquake-banner="active"`。
2. **圓角卡殼與微互動**：
   - 內層卡片容器：
     `flex flex-col items-center gap-2 rounded-3xl border px-5 py-4 text-center text-sm shadow-lg transition-all motion-reduce:transition-none sm:scale-[1.02] sm:px-8 sm:py-5 ${tone}`
   - **配色計畫**：維持專屬琥珀色系，避免與颱風陸警（紅底）或海警（橙底）混淆：
     - 卡片背景與邊框：`border-amber-800 bg-amber-600 text-white hover:bg-amber-700`
     - 徽章：`bg-white text-amber-800 rounded px-1.5 py-0.5 text-xs font-bold`
     - 連結：`font-semibold underline underline-offset-2 text-white decoration-white/70 hover:decoration-white`
3. **資訊排版層次（字級分配）**：
   - 主標題容器：`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-lg font-extrabold tracking-tight sm:text-xl`
   - Emoji 放大：`<span aria-hidden="true" className="text-3xl leading-none sm:text-4xl">🫨</span>`
   - 核心數據維持大字級：「有感地震」、規模 `data-earthquake-magnitude`、最大震度 `data-earthquake-intensity`。
   - 震央位置（長文字）比照颱風名稱做次級字級微調：
     `<span data-earthquake-location className="text-base font-bold sm:text-lg">`
   - 發生時間維持輔助字級：`className="text-xs font-normal opacity-90"`。
4. **說明文字與工具連結**：
   - 保持現有 notice 文案（`text-xs leading-relaxed sm:text-sm`）：
     「震度分布與後續地震資訊，請以中央氣象署公告為準。」
   - 保持單一「地震速報工具」連結（指向 `/tools/global-watch/earthquakes`），完全相容既有多語系鍵值與測試契約。

---

## 3. Scope of Changes

- `components/Earthquake/EarthquakeBanner.tsx`：重構外層容器與排版 className，對齊 `TyphoonBanner.tsx`。
- `tests/earthquake-banner.test.mjs`：驗證既有原始碼契約與行為測試依然 100% 通過。

---

## 4. Verification Plan

1. 執行 `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/earthquake-banner.test.mjs` 確保所有測試案例通過。
2. 執行 `pnpm typecheck` 確保無 TypeScript 型別錯誤。

