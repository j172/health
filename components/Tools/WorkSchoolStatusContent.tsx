"use client";

import { useMemo } from "react";
import { useLanguage } from "@/app/context/LanguageContext";
import { useMinuteClock } from "@/lib/hooks/useMinuteClock";
import { useSidebarWidgetData } from "@/components/Tools/useSidebarWidgetData";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import {
  buildWorkdayAnswer,
  type DayStatus,
  type IsoDate,
  type UpcomingDay,
} from "@/lib/tools/workSchoolStatus/calendar";
import {
  CLOSURE_OFFICIAL_LINKS,
  DGPA_CALENDAR_PAGE_URL,
  OFFICE_CALENDAR_DATASET_PAGE_URL,
  type ClosureLink,
} from "@/lib/tools/workSchoolStatus/closureGuidance";
import type { WorkSchoolStatusResponse } from "@/lib/tools/workSchoolStatus/apiTypes";

/**
 * 「今天要上班上課嗎？」 (issue #691) — one page answering two different things:
 *
 * 1. 政府機關今天／明天要不要上班, from the official office calendar (含補班日),
 *    plus the holidays and 補班日 of the next 60 days. Fetched from
 *    /api/tools/work-school-status; today/tomorrow are re-derived here from the
 *    returned rows with the visitor's own clock (Asia/Taipei date), so a cached
 *    response that has crossed midnight can never show yesterday's answer.
 * 2. 天然災害停止上班及上課 — LINK-ONLY. There is no stable, public,
 *    machine-readable source for per-county closures (see
 *    lib/tools/workSchoolStatus/closureGuidance.ts), so this block is static
 *    guidance plus the official links. It does not depend on the API at all:
 *    it renders in full while the calendar loads, and when the API fails.
 *    The only live hint is whether the Central Weather Administration has a
 *    typhoon warning out, worded as "go and read the announcement".
 *
 * Holiday names (國慶日, 補假, 補行上班 …) are government data and stay in
 * Chinese in every language; the UI around them is translated.
 */

const INTL_LOCALE = { "zh-TW": "zh-TW", en: "en", ja: "ja", ko: "ko" } as const;

const parseIsoDate = (date: IsoDate): Date => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** `2026-10-16` -> "2026年10月16日 週五" (localized). The date is a calendar date, so UTC is used on purpose. */
const formatDate = (date: IsoDate, locale: keyof typeof INTL_LOCALE): string =>
  new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(parseIsoDate(date));

const formatSyncedAt = (iso: string, locale: keyof typeof INTL_LOCALE): string =>
  new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

type Translate = (key: string, defaultValue?: string) => string;

const STATE_STYLES: Record<DayStatus["state"], string> = {
  workday:
    "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100",
  "makeup-workday":
    "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100",
  off: "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100",
  unknown:
    "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200",
};

const STATE_EMOJI: Record<DayStatus["state"], string> = {
  workday: "🏢",
  "makeup-workday": "📌",
  off: "🏖️",
  unknown: "❔",
};

function stateLabel(t: Translate, status: DayStatus): string {
  switch (status.state) {
    case "workday":
      return t("workSchoolStatusTool.stateWorkday", "要上班");
    case "makeup-workday":
      return t("workSchoolStatusTool.stateMakeup", "要上班（補班日）");
    case "off":
      return status.offReason === "weekend"
        ? t("workSchoolStatusTool.stateOffWeekend", "放假（週末）")
        : t("workSchoolStatusTool.stateOffHoliday", "放假");
    default:
      return t("workSchoolStatusTool.stateUnknown", "查無日曆資料");
  }
}

function DayCard({
  heading,
  status,
  t,
  locale,
}: {
  heading: string;
  status: DayStatus;
  t: Translate;
  locale: keyof typeof INTL_LOCALE;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${STATE_STYLES[status.state]}`} data-testid={`day-card-${status.date}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{heading}</p>
      <p className="mt-1 text-sm font-medium opacity-90">{formatDate(status.date, locale)}</p>
      <p className="mt-2 flex items-center gap-2 text-2xl font-extrabold">
        <span aria-hidden="true">{STATE_EMOJI[status.state]}</span>
        <span>{stateLabel(t, status)}</span>
      </p>
      {status.state !== "unknown" && status.name ? (
        <p className="mt-1 text-sm font-semibold" lang="zh-TW">
          {status.name}
        </p>
      ) : null}
      {status.state === "unknown" ? (
        <p className="mt-2 text-xs leading-relaxed">
          {t("workSchoolStatusTool.stateUnknownHint", "本站的辦公日曆資料沒有涵蓋這一天，請查看人事行政總處公布的辦公日曆表。")}
        </p>
      ) : null}
    </div>
  );
}

function UpcomingList({
  items,
  t,
  locale,
}: {
  items: UpcomingDay[];
  t: Translate;
  locale: keyof typeof INTL_LOCALE;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {t("workSchoolStatusTool.upcomingEmpty", "接下來 60 天內沒有國定假日、補假或補班日。")}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
      {items.map((item) => (
        <li key={item.date} className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-white px-4 py-2.5 dark:bg-slate-900">
          <span className="w-44 shrink-0 text-sm font-semibold text-slate-800 dark:text-slate-100">
            {formatDate(item.date, locale)}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              item.kind === "makeup-workday"
                ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                : "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200"
            }`}
          >
            {item.kind === "makeup-workday"
              ? t("workSchoolStatusTool.badgeMakeup", "補班日")
              : t("workSchoolStatusTool.badgeHoliday", "放假")}
          </span>
          {item.name ? (
            <span className="text-sm text-slate-700 dark:text-slate-300" lang="zh-TW">
              {item.name}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const CLOSURE_LINK_KEYS: Record<ClosureLink["id"], { key: string; fallback: string }> = {
  announcement: { key: "closurePrimaryCta", fallback: "開啟人事行政總處「天然災害停止上班及上課情形」" },
  contacts: { key: "linkContacts", fallback: "各地方政府停班停課洽詢電話一覽表" },
  history: { key: "linkHistory", fallback: "歷次天然災害停止上班上課訊息" },
  regulation: { key: "linkRegulation", fallback: "天然災害停止上班及上課作業辦法（全國法規資料庫）" },
  qa: { key: "linkQa", fallback: "天然災害停止上班及上課作業 Q&A" },
  labor: { key: "linkLabor", fallback: "勞動部：天然災害發生事業單位勞工出勤管理及工資給付要點（民間事業單位）" },
};

/**
 * The closure block. Pure static guidance plus links — never per-county
 * status. `typhoonWarning` only changes the banner above the explanation.
 */
function ClosureGuidanceSection({ typhoonWarning, t }: { typhoonWarning: boolean | null; t: Translate }) {
  const primary = CLOSURE_OFFICIAL_LINKS.find((link) => link.primary);
  const others = CLOSURE_OFFICIAL_LINKS.filter((link) => !link.primary);
  const linkProps = (link: ClosureLink) => ({
    href: appendOutboundUtm(link.url, { medium: "tool_page", campaign: "work_school_status" }),
    target: "_blank" as const,
    rel: "noopener noreferrer",
  });

  return (
    <section aria-labelledby="closure-heading" className="space-y-4" data-testid="closure-guidance">
      <h2 id="closure-heading" className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
        {t("workSchoolStatusTool.closureHeading", "天然災害（颱風、地震等）停止上班及上課")}
      </h2>

      {typhoonWarning === true ? (
        <div
          role="status"
          className="rounded-2xl border border-red-300 bg-red-50 p-4 text-red-950 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100"
          data-testid="typhoon-warning-banner"
        >
          <p className="font-bold">
            <span aria-hidden="true">🌀 </span>
            {t("workSchoolStatusTool.typhoonWarningTitle", "中央氣象署目前有颱風警報發布中")}
          </p>
          <p className="mt-1 text-sm">
            {t(
              "workSchoolStatusTool.typhoonWarningBody",
              "這只代表氣象署發布了警報，不代表已經停班停課。請立即開啟下方官方公告，確認您所在縣市的決定。",
            )}
          </p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/50">
        <p className="font-bold text-slate-900 dark:text-slate-100">
          {t("workSchoolStatusTool.closureNotShownTitle", "本站不顯示各縣市是否停班停課")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {t(
            "workSchoolStatusTool.closureLead",
            "各縣市是否停止上班、上課，由縣市政府依《天然災害停止上班及上課作業辦法》決定並通報，行政院人事行政總處彙整後公布。",
          )}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {t(
            "workSchoolStatusTool.closureWhy",
            "人事行政總處沒有提供程式可穩定讀取的公開資料介接，公告頁的排版也曾多次調整。這是影響出門安全的訊息，本站寧可不顯示，也不轉載可能過時或解析錯誤的結果。",
          )}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {t(
            "workSchoolStatusTool.closureAction",
            "颱風警報發布或天氣惡劣時，請直接開啟官方公告頁，或洽各縣市政府確認：",
          )}
        </p>
        {primary ? (
          <a
            {...linkProps(primary)}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            data-testid="closure-primary-link"
          >
            {t(`workSchoolStatusTool.${CLOSURE_LINK_KEYS.announcement.key}`, CLOSURE_LINK_KEYS.announcement.fallback)}
            <span aria-hidden="true">↗</span>
          </a>
        ) : null}
        <p className="mt-3 text-xs font-semibold text-slate-600 dark:text-slate-400">
          {t("workSchoolStatusTool.closureAttribution", "依行政院人事行政總處公開資訊，非本站判定。")}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
          {t("workSchoolStatusTool.closureMoreHeading", "更多官方資訊（中文）")}
        </h3>
        <ul className="mt-2 space-y-1.5 text-sm">
          {others.map((link) => (
            <li key={link.id}>
              <a
                {...linkProps(link)}
                className="font-medium text-indigo-700 hover:underline dark:text-indigo-300"
              >
                {t(`workSchoolStatusTool.${CLOSURE_LINK_KEYS[link.id].key}`, CLOSURE_LINK_KEYS[link.id].fallback)}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          {t(
            "workSchoolStatusTool.closureScope",
            "停班停課的適用範圍是各級政府機關及公、私立學校；交通運輸、警察、消防、醫療等全年無休的機關（構）不適用。民間事業單位及勞工依勞動部《天然災害發生事業單位勞工出勤管理及工資給付要點》處理。",
          )}
        </p>
      </div>
    </section>
  );
}

function SourceFooter({
  calendar,
  windowTruncated,
  coveredTo,
  t,
  locale,
}: {
  calendar: WorkSchoolStatusResponse["calendar"];
  windowTruncated: boolean;
  coveredTo: IsoDate | null;
  t: Translate;
  locale: keyof typeof INTL_LOCALE;
}) {
  return (
    <div className="space-y-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400" data-testid="calendar-source">
      <p>
        {t("workSchoolStatusTool.sourceLine", "資料來源：行政院人事行政總處《中華民國政府行政機關辦公日曆表》")}{" "}
        <a
          href={appendOutboundUtm(OFFICE_CALENDAR_DATASET_PAGE_URL, { medium: "tool_page", campaign: "work_school_status" })}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {t("workSchoolStatusTool.datasetLink", "政府資料開放平臺 14718")}
        </a>
        {" · "}
        <a
          href={appendOutboundUtm(DGPA_CALENDAR_PAGE_URL, { medium: "tool_page", campaign: "work_school_status" })}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {t("workSchoolStatusTool.officialCalendarLink", "人事行政總處辦公日曆表")}
        </a>
      </p>
      {calendar.source === "db" && calendar.syncedAt ? (
        <p>
          {t("workSchoolStatusTool.syncedLine", "本站最近一次同步：{time}").replace(
            "{time}",
            formatSyncedAt(calendar.syncedAt, locale),
          )}
        </p>
      ) : null}
      {calendar.source === "seed" || calendar.source === "mixed" ? (
        <p className="font-semibold text-amber-700 dark:text-amber-400">
          {t(
            "workSchoolStatusTool.seedLine",
            "目前顯示的是本站內建的日曆備援副本（取自 {date}），尚未取得最新同步資料。",
          ).replace("{date}", calendar.seedRetrievedAt ?? "—")}
        </p>
      ) : null}
      {calendar.source === "none" ? (
        <p className="font-semibold text-amber-700 dark:text-amber-400">
          {t("workSchoolStatusTool.noneLine", "本站目前沒有可用的日曆資料，請直接查看人事行政總處公布的辦公日曆表。")}
        </p>
      ) : null}
      {windowTruncated && coveredTo ? (
        <p>
          {t(
            "workSchoolStatusTool.truncatedNotice",
            "日曆資料目前只到 {date}，更後面的假日尚未公布或尚未同步，列表可能不完整。",
          ).replace("{date}", coveredTo)}
        </p>
      ) : null}
    </div>
  );
}

const parseResponse = (json: unknown): WorkSchoolStatusResponse => {
  const body = json as Partial<WorkSchoolStatusResponse> | null;
  if (!body || body.ok !== true || !Array.isArray(body.days) || !body.closure || !body.calendar || !body.window) {
    throw new Error("Unexpected /api/tools/work-school-status payload");
  }
  return body as WorkSchoolStatusResponse;
};

export default function WorkSchoolStatusContent() {
  const { t, locale } = useLanguage();
  const { status, data, refresh } = useSidebarWidgetData<WorkSchoolStatusResponse>({
    buildUrl: () => "/api/tools/work-school-status",
    parse: parseResponse,
    deps: [],
  });

  // "Now" comes from useMinuteClock (null until mounted, refreshed each minute) so
  // the server render and first client render match and nothing reads the clock
  // during render.
  const nowMs = useMinuteClock();

  const answer = useMemo(
    () => (data && nowMs !== null ? buildWorkdayAnswer(data.days, nowMs) : null),
    [data, nowMs],
  );

  const typhoonWarning = data?.closure.typhoonWarningActive ?? null;
  const failed = status === "error" && !data;

  return (
    <div className="space-y-10">
      <section aria-labelledby="calendar-heading" className="space-y-4">
        <div>
          <h2 id="calendar-heading" className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
            {t("workSchoolStatusTool.calendarHeading", "政府機關：今天、明天要上班嗎？")}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            {t(
              "workSchoolStatusTool.calendarScope",
              "依行政院人事行政總處《政府行政機關辦公日曆表》，適用政府行政機關；學校另有學年行事曆，民間事業單位依勞基法與公司規定，不一定相同。",
            )}
          </p>
        </div>

        {failed ? (
          <div
            role="alert"
            className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
            data-testid="calendar-load-error"
          >
            <p className="font-bold">{t("workSchoolStatusTool.loadError", "暫時無法取得辦公日曆資料。")}</p>
            <p className="mt-1">
              {t("workSchoolStatusTool.loadErrorHint", "請直接查看人事行政總處公布的辦公日曆表：")}{" "}
              <a
                href={appendOutboundUtm(DGPA_CALENDAR_PAGE_URL, { medium: "tool_page", campaign: "work_school_status" })}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline"
              >
                {t("workSchoolStatusTool.officialCalendarLink", "人事行政總處辦公日曆表")}
              </a>
            </p>
            <button
              type="button"
              onClick={refresh}
              className="mt-2 rounded-lg border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200"
            >
              {t("workSchoolStatusTool.retry", "重試")}
            </button>
          </div>
        ) : null}

        {!failed && !answer ? (
          <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-live="polite">
            {[0, 1].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            ))}
            <span className="sr-only">{t("workSchoolStatusTool.loading", "載入中…")}</span>
          </div>
        ) : null}

        {answer && data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2" aria-live="polite">
              <DayCard heading={t("workSchoolStatusTool.todayLabel", "今天")} status={answer.today} t={t} locale={locale} />
              <DayCard
                heading={t("workSchoolStatusTool.tomorrowLabel", "明天")}
                status={answer.tomorrow}
                t={t}
                locale={locale}
              />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                {t("workSchoolStatusTool.upcomingHeading", "接下來 60 天的假日與補班日")}
              </h3>
              <UpcomingList items={answer.upcoming} t={t} locale={locale} />
            </div>

            <SourceFooter
              calendar={data.calendar}
              windowTruncated={answer.windowTruncated}
              coveredTo={answer.coveredTo}
              t={t}
              locale={locale}
            />
          </>
        ) : null}
      </section>

      <ClosureGuidanceSection typhoonWarning={typhoonWarning} t={t} />
    </div>
  );
}
