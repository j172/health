# Spec: 首頁狀態列休假卡片整合與「下個假日」倒數

> **Status:** `ready-for-agent`  
> **Type:** Feature Specification / PRD  
> **Source:** Conversation interview synthesis (/grill) & /to-spec  

## Problem Statement

目前在網站首頁頂部狀態列中，休假相關資訊被拆分成兩個並排的獨立卡片：「今天上班上課」與「明日上班」，並且在「今天上班上課」卡片旁邊還附掛了一個微型捷徑圖示按鈕（「明天放假嗎？」）。

從使用者的角度來看，這種排版帶來了多重體驗問題：
1. **資訊冗餘與重複**：在週末或連假期間（例如週六放假、週日也是節日放假），使用者同時看到兩張卡片都寫著「放假」，佔用雙倍的視覺版面卻提供高度重疊的資訊；同時第一張卡片旁邊的「明天放假嗎？」小圖示也與第二張「明日上班」卡片功能重複。
2. **缺乏上班族最在意的核心訴求（下個假日倒數）**：在平常上班日（週一至週五），使用者看狀態列除了想確認今天有沒有特殊放假外，更迫切想知道的是「還要上幾天班才能休假？」（距離下一個週末或國定假日還有幾天）。現行介面只顯示今天與明天，無法回答「何時能休假」的心理預期。
3. **版面尺寸不一與橫向空間擁擠**：由於附屬捷徑按鈕的存在，第一個休假卡片模組的結構與其他標準膠囊卡片（天氣、AQI、紫外線、地震等）不同，導致在行動裝置或較窄螢幕下換行排版不齊整。

## Solution

將首頁狀態列中的「今天上班上課」與「明日上班」兩張卡片，以及附屬的明日捷徑小按鈕，整合為單一標準尺寸的「休假狀態膠囊卡片」。

該卡片採用「倒數核心」與「動態情境語意化」模式：
1. **在上班日（距離休假 > 1 天）**：標籤顯示「下個假日」，內容主打倒數「還有 N 天（週六）」或「還有 N 天（{節日名}）」，圖示顯示辦公大樓（🏢），直接滿足使用者對下一次假日的期盼。
2. **在休假前一天（平日且明天放假，如週五）**：標籤顯示「下個假日」，內容顯示「明天放假（週六）」或「明天放假（{節日名}）」，圖示維持 🏢。
3. **在放假中（週六、週日、國定假日或彈性放假）**：卡片動態轉化為當日放假狀態，標籤切換為「今日放假」，內容顯示「放假中（週末）」或「放假中（{節日名}）」，圖示切換為度假情境（🏖️）。
4. **在補班日（週六補行上班）**：標籤切換為「今日上班」，內容顯示「補班日（要上班）」，圖示為 🏢。
5. **單一卡片標準膠囊化**：移除多餘的小按鈕，整張卡片維持與天氣、AQI 等其他狀態晶片一致的視覺規格，點擊整張卡片即可前往完整的政府辦公日曆工具頁面。

## User Stories

1. As a weekday commuter on Monday morning, I want to see how many days are left until the next holiday on the homepage status bar, so that I have a clear milestone to look forward to during the workweek.
2. As an office worker on Wednesday, I want the status bar to show the countdown to either the upcoming weekend or an intervening midweek national holiday, so that I immediately know my earliest upcoming day off.
3. As an employee on Friday, I want the card to clearly state that tomorrow is a holiday, so that I get instant confirmation that the weekend begins tomorrow without doing mental math.
4. As a student on Saturday, I want the card to dynamically indicate that today is a weekend day off, so that I don't see redundant countdowns or duplicate "tomorrow is also off" pills.
5. As a citizen during a designated national holiday or consecutive holiday, I want the card to show that today is a holiday along with the holiday's official name, so that I understand why public offices are closed today.
6. As a worker on a government-mandated Saturday make-up workday (補班日), I want the card to clearly show that today is a workday that requires attendance, so that I don't mistakenly assume it is a regular weekend day off.
7. As a mobile phone user with a narrow viewport, I want the holiday card to occupy a single standard-width pill rather than two adjacent cards and an auxiliary shortcut, so that the homepage status bar does not wrap awkwardly or crowd out other essential metrics like weather and alerts.
8. As a non-Chinese-speaking visitor browsing in English, Japanese, or Korean, I want the countdown, holiday label, and day-off reasons to be accurately localized into my chosen language, so that I can understand public holiday schedules in Taiwan.
9. As a user visiting right after midnight Asia/Taipei time, I want the countdown and status to resolve instantly against my client clock without being served stale cached data from yesterday, so that I never see outdated day counts.
10. As an accessibility user using a screen reader, I want the single holiday card to have a clear, self-contained aria-label describing today's status or the next holiday countdown, so that I receive unambiguous auditory feedback.
11. As a user planning future vacations, I want clicking anywhere on the holiday card to take me directly to the comprehensive office calendar tool page, so that I can view the complete 60-day calendar and official day-off guidance.
12. As a user browsing when official calendar notes contain lengthy names (e.g. 臺灣光復暨金門古寧頭大捷紀念日), I want the card to gracefully handle the text with single-line ellipsis truncation without breaking the card's dimensions or horizontal layout.
13. As a developer or system operator during an upstream API degradation or missing calendar window, I want the card to fail safely by showing an honest "no calendar data" status rather than guessing by weekday, so that users are never misinformed about official work requirements.

## Implementation Decisions

### 1. Unified Card Module & Component Architecture
- Merge the two separate status sections and the auxiliary shortcut button into a single consolidated Holiday Status Pill within the Homepage Status Bar module.
- The pill maintains parity with existing status pills: standard responsive width, rounded borders, subtle transitions, and single-line text truncation.
- Clicking the pill links directly to the canonical office calendar tool route.

### 2. State Model & Resolution Prototype
The pure resolution logic takes the loaded calendar day rows and the visitor's Asia/Taipei instant, producing a discrete state representation:

```typescript
// Prototype state contract for holiday status resolution
export type HomeHolidayMode =
  | "workday-countdown" // Weekday with > 1 day until next holiday (🏢, "下個假日", "還有 N 天（...）")
  | "tomorrow-off"      // Weekday with 1 day until holiday (🏢, "下個假日", "明天放假（...）")
  | "today-off"         // Currently a day off (🏖️, "今日放假", "放假中（...）")
  | "makeup-workday"    // Saturday make-up workday (🏢, "今日上班", "補班日（要上班）")
  | "unknown";          // Missing calendar coverage (🏢, "下個假日", "查無日曆資料")

export interface HomeNextHolidayChip {
  mode: HomeHolidayMode;
  emoji: "🏢" | "🏖️";
  labelKey: string;
  valueKey: string;
  valueParams?: { days?: number; name?: string };
}
```

### 3. Holiday Identification & Search Horizon
- "Next holiday" is defined as the nearest calendar date strictly greater than today where the official calendar marks the day as off (`isHoliday: true`).
- Both regular weekend days (Saturday and Sunday) and official named holidays/make-up days off qualify as holidays.
- For weekday countdowns, the algorithm searches forward starting from tomorrow (`today + 1 day`) to find the first day off.
- The maximum distance from a weekday to a weekend day in Taiwan is at most 6 days (due to occasional 6-day workweeks preceding extended holidays).
- The homepage status backend aggregation query filters and exposes a 14-day window of calendar rows (expanded from the legacy 4-day window). The underlying source window already caches 62 days, so this requires no additional upstream fetch or database overhead.

### 4. Auxiliary Shortcut Removal
- The legacy `WorkdayTomorrowShortcut` component (the small 🗓️ button) is removed from the DOM.
- The tomorrow status is intrinsically incorporated into the unified card (either through the "明天放假" mode on the eve of a holiday, or via navigation to the full calendar tool page).

### 5. Internationalization & Localization
- Update translation dictionaries across Chinese (Traditional), English, Japanese, and Korean.
- Keys to introduce:
  - Header labels: "下個假日" (Next Holiday), "今日放假" (Day Off Today), "今日上班" (Workday Today).
  - Countdown strings: template for "還有 {days} 天（{name}）", template for "明天放假（{name}）".
  - Day off status strings: "放假中（{name}）", "放假中（週末）".
  - Make-up day string: "補班日（要上班）".

## Testing Decisions

### What Makes a Good Test
- Tests must strictly evaluate **observable external behavior and contracts**, not internal implementation details or private variables.
- Domain logic tests must verify that given a fixture calendar and a simulated visitor clock instant in Asia/Taipei, the returned mode, countdown days, target holiday name, and emoji match specifications exactly.
- Edge caching resilience tests must verify that a set of calendar rows fetched before midnight continues to resolve the correct date and countdown after midnight purely via clock progression.
- Integration tests must verify that the homepage status bar renders exactly one holiday status pill with the proper link, without lingering tomorrow pills or removed shortcut icons.

### Modules Tested
1. **Pure Office Calendar & Holiday Resolution Logic**:
   - Weekday to weekend countdowns (Monday through Thursday -> Saturday).
   - Weekday to midweek holiday countdowns (e.g. Monday to Wednesday national holiday).
   - Holiday eve detection (Friday -> Saturday, or day before national holiday -> "明天放假").
   - Weekend and multi-day holiday streaks (Saturday and Sunday -> "今日放假").
   - Saturday make-up workday detection (-> "補班日（要上班）").
   - Client clock crossing midnight without re-fetching rows.
   - Missing row / unknown range fallback.
2. **Acceptance & Integration Contracts**:
   - Homepage status bar integration tests ensuring the new label keys and structure match across all supported locales.

### Prior Art
- Existing unit tests in `lib/tools/workSchoolStatus/calendar.test.mjs` test date classification and chip generation via Node.js native test runner (`node:test`).
- End-to-end acceptance tests in `tests/work-school-status-691.test.mjs` verify catalog registration, i18n presence, and homepage status bar link expectations.

## Out of Scope

1. **Natural Disaster Suspensions (Typhoon / Rain Closures)**: Per architectural decision #691 and #744, natural disaster closure declarations by individual counties remain strictly "link-only" and are surfaced exclusively via site-wide emergency banners and external official links, never by calculating county-level suspension inside this status pill.
2. **Interactive Date Pickers in Status Bar**: The status bar remains a quick-glance ambient status overview. Deep date navigation, full-year calendar inspection, and historical queries are reserved for the `/tools/work-school-status` page.
3. **Leave Planning & Annual Leave Optimization**: Vacation optimization calculators ("請假攻略") or multi-day trip recommendations are separate potential features and are not part of this ambient status pill.

## Further Notes

- Taiwan Standard Time is UTC+08:00 year-round with no Daylight Saving Time (DST has not been observed since 1979). A flat +24h or day increment relative to UTC+08:00 reliably lands on sequential calendar dates.
- Long holiday names (such as "臺灣光復暨金門古寧頭大捷紀念日") must not have custom hardcoded substring trunction in JavaScript; they should rely on CSS `truncate` so that the full semantic string remains in the DOM and is readable by assistive technologies and tooltips.
