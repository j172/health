# Feature Specification: Multi-Language Switching (i18n) & First-Character Footer Collation

## Overview

This document specifies the technical design, requirements, and implementation details for:
1. **Multi-Language Switching (i18n)** supporting Traditional Chinese (`zh-TW`), Simplified Chinese (`zh-CN`), and English (`en`).
2. **OpenCC Dynamic Translation** for live API content (earthquakes, news, AQI stations).
3. **First-Character Collation** (`localeCompare('zh-Hant')`) for tool catalog entries and footer navigation links.

---

## 1. Multi-Language Switching (i18n)

### 1.1 Requirements
* **Locales Supported**:
  * `zh-TW` (正體中文) - Default fallback
  * `zh-CN` (简体中文)
  * `en` (English)
* **Routing Strategy**: Client-side / Cookie-based state without locale path prefixes (e.g. URLs remain `/news`, `/tools/earthquakes`).
* **Persistence & Auto-Detection**:
  * Persisted in LocalStorage (`locale`) and Cookie (`locale`).
  * Automatically detects browser language (`navigator.language`) on initial visit.

### 1.2 Architecture
* **`app/context/LanguageContext.tsx`**:
  * Provides `locale`, `setLocale(newLocale)`, `t(key, defaultVal)`, and `tDynamic(text)`.
  * Loads dictionary files from `locales/zh-TW.json`, `locales/zh-CN.json`, `locales/en.json`.
* **`components/Header/LanguageToggler.tsx`**:
  * Renders a 🌐 dropdown widget in the Header (next to `ThemeToggler`).
  * Allows one-click switching between `zh-TW`, `zh-CN`, and `en`.

### 1.3 OpenCC Dynamic Translation
* Integrated `opencc-js` (`OpenCC.Converter({ from: 'tw', to: 'cn' })`).
* When `locale === 'zh-CN'`, `tDynamic(text)` dynamically converts Traditional Chinese text (e.g. USGS/CWA earthquake epicenter places, news titles) into Simplified Chinese on-the-fly.
* When `locale === 'en'`, `tDynamic` prioritizes native English fields (e.g. `item.place` from USGS).

---

## 2. First-Character Collation (`zh-Hant`)

### 2.1 Requirements
* All links within the 5 footer categories (`全站總覽`, `醫療院所`, `長照機構`, `食品營養`, `健康算盤與工具`) must be sorted by their first character using standard Traditional Chinese stroke / Bopomofo collation (`localeCompare('zh-Hant', { numeric: true })`).

### 2.2 Global TOOL_CATALOG Collation
* In `lib/server/tools/catalog.ts`, `TOOL_CATALOG` is sorted globally:
  ```ts
  TOOL_CATALOG.sort((a, b) => a.title.localeCompare(b.title, "zh-Hant", { numeric: true }));
  ```
* Ensures consistent sorting across `/tools` index, footer columns, navigation dropdowns, and `llms.txt`.

### 2.3 SiteFooter Categories
* In `components/News/SiteFooter.tsx`, all 5 columns (`overviewLinks`, `calculatorTools`, `facilityTools`, `ltcTools`, `foodTools`) apply first-character collation before rendering.

---

## 3. Verification & Compliance
* **Type Safety**: Verified with `npx tsc --noEmit` (0 errors).
* **Build**: Verified with `npm run build` (0 build errors, 74 routes compiled successfully).
