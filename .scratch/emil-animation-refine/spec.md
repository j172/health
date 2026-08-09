# Specification: HEALTH 網站 Emil Kowalski 全站動效與 UI 細節優化

## Problem Statement

HEALTH 網站 (`d:\GoogleDrive\health`) 的使用者介面與元件目前存在動態體驗層面的細節缺失：
1. 現有的 `framer-motion` 元件動畫時間過長（500ms），缺乏流暢的自然加速曲線，使頁面顯得笨重感。
2. 按鈕、選單與導覽組件缺乏實體壓下（Press/Active feedback）與浮起互動，點擊時回應生硬。
3. 新聞卡片 (`NewsCard`) 的圖片懸浮放大倍率過大 (`scale-105`) 且使用重度 CSS `transition-all` 引發全頁重排。
4. 即時監測數據（地震、強風特報、UV 紫外線）燈號僅為靜態或粗糙的全區塊 `animate-pulse` 閃爍，缺乏視覺警報感。
5. 骨架屏（Skeleton Loading）缺乏掠光質感。

## Solution

依據 Emil Kowalski 的 Design Engineering 規範 (`emil-design-eng`, `animate`, `apple-design`, `review-animations`)：
1. 統一調校全站動效 Timing 至 **200-250ms**，套用 Ease-Out 曲線 `[0.16, 1, 0.3, 1]`。
2. 為全站按鈕與選單建立三段式觸覺回饋（Hover `-translate-y-[1.5px]`, Active `scale-[0.97]`, Dropdown `backdrop-blur-md`）。
3. 調校 `NewsCard` 圖片 Hover 為典雅的 `scale-[1.03]` 與高質感擴張陰影。
4. 升級告警燈號為 Apple 風格波紋漣漪 (`alert-ripple`)。
5. 全站 Skeleton 導入掠光 (Shimmer Sweep) 質感。

## User Stories

1. As a HEALTH website reader, I want interactive buttons to respond immediately with a subtle tactile press effect (`scale-0.97`), so that clicking feels physically satisfying and responsive.
2. As a mobile and desktop user, I want dropdown menus (such as language toggler) to slide down smoothly with backdrop blur glassmorphism (`backdrop-blur-md`), so that navigation feels clean and modern.
3. As a health news reader, I want news card thumbnails to expand softly (`scale-1.03`) without jarring full-page reflows, so that browsing articles feels high-end.
4. As a user checking real-time earthquake and weather alerts, I want status indicators to feature subtle live ripple pulses, so that urgent information immediately draws attention naturally.
5. As a user waiting for page content to load, I want skeleton placeholders to display a metallic shimmer sweep animation, so that waiting feels faster and more polished.
6. As a user with motion sensitivity (`prefers-reduced-motion: reduce`), I want motion effects to automatically degrade gracefully to simple opacity fades, so that browsing remains accessible and comfortable.

## Implementation Decisions

- **Global Design Tokens**: Define `--ease-out-emil: cubic-bezier(0.16, 1, 0.3, 1)`, `--duration-fast: 150ms`, `--duration-normal: 250ms` inside `app/globals.css` `@theme`.
- **Framer Motion Tuning**: Update Framer Motion variants across `SingleFeature.tsx`, `BlogItem.tsx`, `SectionHeader.tsx` to duration `0.25s` and ease `[0.16, 1, 0.3, 1]`.
- **Button Micro-interactions**: Add `hover:-translate-y-[1.5px]`, `active:scale-[0.97]`, and `transition-[transform,box-shadow,background-color]` to `LanguageToggler.tsx` and header interactive elements.
- **Card Motion Refinement**: Replace `group-hover:scale-105` with `group-hover:scale-[1.03]` in `NewsCard.tsx` and optimize transition classes.
- **Live Status & Shimmer**: Implement `@keyframes shimmer` and `@keyframes alert-ripple` in `app/globals.css`. Apply alert-ripple to `EarthquakeSidebarWidget.tsx` and `WeatherAlertSidebarWidget.tsx`.

## Testing Decisions

- Test user interactions (hover, active press) on desktop and mobile viewports.
- Run `npx tsc --noEmit` and `npm run lint` to verify type safety and code clean-up.
- Run `npm run build` to confirm zero compilation errors.

## Out of Scope

- Major backend schema alterations or database structure changes.
- Structural layout redesign of non-UI content components.
