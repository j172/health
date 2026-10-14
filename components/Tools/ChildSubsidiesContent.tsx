"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import { matchChildSubsidies } from "@/lib/server/childSubsidies/matchChildSubsidies";
import type {
  CareType,
  ChildSubsidyRule,
  Parity,
  PolicyWatchItem,
  WelfareStatus,
} from "@/lib/server/childSubsidies/types";

interface Props {
  initialRules: ChildSubsidyRule[];
  policyWatch: PolicyWatchItem[];
}

const CARE_TYPE_OPTIONS: { value: CareType; label: string }[] = [
  { value: "home-care", label: "自行照顧（家長或親屬）" },
  { value: "private-nursery", label: "私托／未簽約保母" },
  { value: "quasi-public-nursery", label: "準公共保母／托嬰中心" },
  { value: "public-nursery", label: "公共化托嬰機構" },
  { value: "private-kindergarten", label: "私立幼兒園（未參與準公共）" },
  { value: "quasi-public-kindergarten", label: "準公共幼兒園" },
  { value: "nonprofit-kindergarten", label: "非營利幼兒園" },
  { value: "public-kindergarten", label: "公立幼兒園" },
];

const PARITY_OPTIONS: { value: Parity; label: string }[] = [
  { value: "first", label: "第1胎" },
  { value: "second", label: "第2胎" },
  { value: "thirdPlus", label: "第3胎（含）以上" },
];

const WELFARE_STATUS_OPTIONS: { value: WelfareStatus; label: string }[] = [
  { value: "general", label: "一般戶" },
  { value: "midLowIncome", label: "中低收入戶" },
  { value: "lowIncome", label: "低收入戶" },
];

// A rule.id prefix, not a magic constant pulled from data — just this
// component's own way of knowing which 3 rules represent a monthly
// out-of-pocket fee *cap* (lower is better) rather than a cash amount, so
// it can caption them differently. See each rule's own `notes` in
// data/child-subsidies.json for the authoritative explanation.
function isFeeCapRule(rule: ChildSubsidyRule): boolean {
  return rule.id.startsWith("school-fee-cap-");
}

function formatCurrency(amount: number): string {
  return `NT$ ${amount.toLocaleString("zh-TW")}`;
}

function formatAgeRange(ageRange: { minMonths: number; maxMonths: number | null }): string {
  const minYears = (ageRange.minMonths / 12).toFixed(1).replace(/\.0$/, "");
  if (ageRange.maxMonths === null) return `${minYears} 歲以上`;
  const maxYears = (ageRange.maxMonths / 12).toFixed(1).replace(/\.0$/, "");
  return `約 ${minYears}–${maxYears} 歲`;
}

const PROPOSED_BY_LABEL: Record<PolicyWatchItem["proposedBy"], string> = {
  executive: "行政院方案",
  legislative: "立法院三讀條例",
};

export default function ChildSubsidiesContent({ initialRules, policyWatch }: Props) {
  // Ages are picked as whole years + months and combined into the single
  // `ageMonths` matchChildSubsidies expects — kept entirely in component
  // state, never sent anywhere (issue #604's privacy requirement: nothing
  // selected on this page leaves the browser).
  const [ageYears, setAgeYears] = useState(1);
  const [ageExtraMonths, setAgeExtraMonths] = useState(0);
  const [careType, setCareType] = useState<CareType>("home-care");
  const [parity, setParity] = useState<Parity>("first");
  const [welfareStatus, setWelfareStatus] = useState<WelfareStatus>("general");

  const ageMonths = ageYears * 12 + ageExtraMonths;

  const matches = useMemo(
    () => matchChildSubsidies({ ageMonths, careType, parity, welfareStatus }, initialRules),
    [ageMonths, careType, parity, welfareStatus, initialRules],
  );

  return (
    <div className="space-y-8">
      {/* ========================================================= */}
      {/* 1. 快速查詢 */}
      {/* ========================================================= */}
      <section
        aria-labelledby="quick-lookup-title"
        className="overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-b from-indigo-50/70 via-white to-white p-5 shadow-sm dark:border-indigo-900/50 dark:from-indigo-950/20 dark:via-slate-900 dark:to-slate-900"
      >
        <h2 id="quick-lookup-title" className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
          快速查詢
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          所有選項僅在您的瀏覽器內試算，不會送出任何網路請求、也不會寫入本機儲存空間。結果僅供參考，正式金額與資格請以官方公告為準。
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300" htmlFor="age-years">
              孩子年齡
            </label>
            <div className="mt-1 flex gap-2">
              <select
                id="age-years"
                value={ageYears}
                onChange={(e) => setAgeYears(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                {Array.from({ length: 7 }, (_, year) => (
                  <option key={year} value={year}>
                    {year} 歲
                  </option>
                ))}
              </select>
              <select
                aria-label="孩子年齡（月）"
                value={ageExtraMonths}
                onChange={(e) => setAgeExtraMonths(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                {Array.from({ length: 12 }, (_, month) => (
                  <option key={month} value={month}>
                    {month} 月
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300" htmlFor="care-type">
              照顧方式
            </label>
            <select
              id="care-type"
              value={careType}
              onChange={(e) => setCareType(e.target.value as CareType)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {CARE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300" htmlFor="parity">
              胎次
            </label>
            <select
              id="parity"
              value={parity}
              onChange={(e) => setParity(e.target.value as Parity)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {PARITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300" htmlFor="welfare-status">
              家庭福利身分
            </label>
            <select
              id="welfare-status"
              value={welfareStatus}
              onChange={(e) => setWelfareStatus(e.target.value as WelfareStatus)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {WELFARE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Results */}
        <div className="mt-5 space-y-3">
          {matches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              依目前選擇的條件，查無符合的現行補助項目。
            </div>
          ) : (
            matches.map(({ rule, amount }) => (
              <div
                key={rule.id}
                className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{rule.name}</h3>
                  <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                    {formatCurrency(amount)}
                    {isFeeCapRule(rule) && (
                      <span className="ml-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        ／月自付上限
                      </span>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{rule.agency}</p>
                {rule.notes && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{rule.notes}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <a
                    href={appendOutboundUtm(rule.officialUrl, { medium: "tool-citation" })}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    官方公告 ↗
                  </a>
                  <span>查證日期：{rule.lastVerified}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ========================================================= */}
      {/* 2. 已宣布、尚未上路 */}
      {/* ========================================================= */}
      <section
        aria-labelledby="policy-watch-title"
        className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-5 dark:border-amber-900/50 dark:bg-amber-950/10"
      >
        <h2 id="policy-watch-title" className="text-xl font-bold text-slate-900 dark:text-white">
          已宣布、尚未上路
        </h2>
        <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
          實施方式尚未確定，以主管機關公告為準。以下方案均未納入上方快速查詢。
        </p>

        <div className="mt-4 space-y-3">
          {policyWatch.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm dark:border-amber-900/40 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  {PROPOSED_BY_LABEL[item.proposedBy]}
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</h3>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{item.summary}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>適用年齡：{formatAgeRange(item.ageRange)}</span>
                <span>預計上路：{item.targetStartDate ?? "尚未確定"}</span>
                <a
                  href={appendOutboundUtm(item.sourceUrl, { medium: "tool-citation" })}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  報導來源 ↗
                </a>
                <span>查證日期：{item.lastVerified}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3. 申請窗口 */}
      {/* ========================================================= */}
      <section aria-labelledby="where-to-apply-title" className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 id="where-to-apply-title" className="text-xl font-bold text-slate-900 dark:text-white">
          申請窗口
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          育兒津貼、托育補助與就學補助請向兒童戶籍地鄉（鎮、市、區）公所或所就讀機構提出申請；生育補助由勞保局併入生育給付自動發給；試管嬰兒補助3.0須先至特約人工生殖機構完成資格審查。若需要社工協助或進一步諮詢，可洽衛生福利部社會及家庭署。
        </p>
        {/* TODO: relatedSlugs to social-welfare-centers once #603 lands —
            that tool doesn't exist in TOOL_CATALOG yet as of this writing,
            so link out to the official 衛福部社家署 page directly for now. */}
        <div className="mt-3">
          <a
            href={appendOutboundUtm("https://www.sfaa.gov.tw/", { medium: "tool-apply-link" })}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-indigo-500"
          >
            衛生福利部社會及家庭署 ↗
          </a>
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          也可參考本站的{" "}
          <Link href="/tools/emergency-hotlines" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
            緊急專線速查
          </Link>
          （1957福利諮詢專線、113全國保護專線）。
        </p>
      </section>
    </div>
  );
}
