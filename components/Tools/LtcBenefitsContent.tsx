"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import { estimateLtcBenefits } from "@/lib/server/ltcBenefits/estimateLtcBenefits";
import type { LtcBenefitsSchedule, LtcNeedLevelSelection, Ltc3PlanItem, WelfareStatus } from "@/lib/server/ltcBenefits/types";
import { LTC_NEED_LEVELS } from "@/lib/server/ltcBenefits/types";

interface Props {
  schedule: LtcBenefitsSchedule;
  updates: Ltc3PlanItem[];
}

const WELFARE_STATUS_OPTIONS: { value: WelfareStatus; label: string }[] = [
  { value: "general", label: "一般戶" },
  { value: "midLowIncome", label: "中低收入戶" },
  { value: "lowIncome", label: "低收入戶" },
];

const APPLICATION_STEPS = [
  {
    order: 1,
    title: "撥打 1966 長照專線",
    body: "免付費，週一至週五 08:30–20:30，例假日 09:00–17:30（國定假日除外）。可由本人、家屬或醫事人員代為申請，也可透過各縣市長期照顧管理中心臨櫃或線上申請。",
  },
  {
    order: 2,
    title: "照管專員或醫事機構到府評估",
    body: "照顧管理專員（或醫院出院準備服務個案管理師）會到府或到院，以「照顧管理評估量表」評估失能或失智程度，核定長照需要等級（第2–8級；第一級為未失能，不納入給付範圍）。",
  },
  {
    order: 3,
    title: "個案管理員擬訂照顧計畫",
    body: "依核定的長照需要等級與個人需求，由個案管理員（照管中心或 A 個管單位）擬訂照顧計畫，安排適合的長照服務組合與特約單位，後續可依狀況變化調整計畫。",
  },
];

function formatCurrency(amount: number): string {
  return `NT$ ${amount.toLocaleString("zh-TW")}`;
}

function LevelSelect({
  value,
  onChange,
}: {
  value: LtcNeedLevelSelection;
  onChange: (value: LtcNeedLevelSelection) => void;
}) {
  return (
    <select
      id="ltc-level"
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "not-assessed" ? "not-assessed" : (Number(raw) as LtcNeedLevelSelection));
      }}
      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
    >
      <option value="not-assessed">還沒評估</option>
      {LTC_NEED_LEVELS.map((level) => (
        <option key={level} value={level}>
          第 {level} 級
        </option>
      ))}
    </select>
  );
}

function CitationFooter({ officialUrl, lastVerified }: { officialUrl: string; lastVerified: string }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
      <a
        href={appendOutboundUtm(officialUrl, { medium: "tool-citation" })}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
      >
        官方公告 ↗
      </a>
      <span>查證日期：{lastVerified}</span>
    </div>
  );
}

export default function LtcBenefitsContent({ schedule, updates }: Props) {
  const [level, setLevel] = useState<LtcNeedLevelSelection>("not-assessed");
  const [welfareStatus, setWelfareStatus] = useState<WelfareStatus>("general");

  // Pure, synchronous, client-side-only calculation (issue #615's privacy
  // requirement, same as /tools/child-subsidies) — nothing selected here is
  // ever sent over the network or written to any local storage.
  const estimate = useMemo(
    () => estimateLtcBenefits({ level, welfareStatus }, schedule),
    [level, welfareStatus, schedule],
  );

  const inEffectUpdates = updates.filter((item) => item.inEffect);
  const plannedUpdates = updates.filter((item) => !item.inEffect);

  return (
    <div className="space-y-8">
      {/* ========================================================= */}
      {/* 1. 申請流程 */}
      {/* ========================================================= */}
      <section
        aria-labelledby="application-flow-title"
        className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <h2 id="application-flow-title" className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
          申請流程：從 1966 到擬訂照顧計畫
        </h2>
        <ol className="mt-4 space-y-3">
          {APPLICATION_STEPS.map((step) => (
            <li key={step.order} className="flex gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-black text-white dark:bg-indigo-500">
                {step.order}
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{step.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          需要確認服務轄區的社福中心或社工協助，可參考本站的{" "}
          <Link href="/tools/social-welfare-centers" className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
            社福中心與社工求助
          </Link>
          。
        </p>
      </section>

      {/* ========================================================= */}
      {/* 2. 長照3.0 新制 */}
      {/* ========================================================= */}
      <section aria-labelledby="ltc3-title" className="space-y-4">
        <h2 id="ltc3-title" className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
          長照3.0新制
        </h2>

        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/10">
          <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-300">已上路</h3>
          <div className="mt-3 space-y-3">
            {inEffectUpdates.map((item) => (
              <div key={item.id} className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm dark:border-emerald-900/40 dark:bg-slate-900">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    {item.effectiveDate} 起施行
                  </span>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</h4>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{item.summary}</p>
                <CitationFooter officialUrl={item.officialUrl} lastVerified={item.lastVerified} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-5 dark:border-amber-900/50 dark:bg-amber-950/10">
          <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300">規劃中</h3>
          <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
            實施方式與時程尚未全部確定，以主管機關正式公告為準。
          </p>
          <div className="mt-3 space-y-3">
            {plannedUpdates.map((item) => (
              <div key={item.id} className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm dark:border-amber-900/40 dark:bg-slate-900">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</h4>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{item.summary}</p>
                <CitationFooter officialUrl={item.officialUrl} lastVerified={item.lastVerified} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3. 額度試算 */}
      {/* ========================================================= */}
      <section
        aria-labelledby="estimator-title"
        className="overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-b from-indigo-50/70 via-white to-white p-5 shadow-sm dark:border-indigo-900/50 dark:from-indigo-950/20 dark:via-slate-900 dark:to-slate-900"
      >
        <h2 id="estimator-title" className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
          給付額度試算
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          所有選項僅在您的瀏覽器內試算，不會送出任何網路請求、也不會寫入本機儲存空間。金額依《長期照顧服務申請及給付辦法》附表二、附表五，實際以照專評估與照顧計畫為準。
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300" htmlFor="ltc-level">
              長照需要等級
            </label>
            <LevelSelect value={level} onChange={setLevel} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300" htmlFor="welfare-status">
              福利身分
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

        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          依《長期照顧服務申請及給付辦法》第14條，列冊之低收入戶與中低收入戶同屬「長照第一類」，部分負擔比率相同（皆為
          0%）；另有部分負擔 5–10% 的「長照第二類」（中低收入老人生活津貼第2款或身心障礙者生活補助資格者）未單獨列於本頁三個選項中，如不確定自己實際屬於哪一類，請洽
          1966 長照專線確認。
        </p>

        {estimate.notAssessed ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            還沒有長照需要等級，無法試算額度。請先完成上方「申請流程」的照專到府評估，取得核定等級後再回來試算。
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">照顧及專業服務（每月）</h3>
                <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(estimate.careService.amount)}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                自付 {estimate.careService.copayPercent}%（約 {formatCurrency(estimate.careService.selfPay)}），政府給付約{" "}
                {formatCurrency(estimate.careService.govPays)}
              </p>
              <CitationFooter officialUrl={schedule.careService.officialUrl} lastVerified={schedule.careService.lastVerified} />
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">交通接送服務（每月，依分區）</h3>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {estimate.transportByRegion.map((region) => (
                  <div key={region.region} className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700">
                    <p className="font-semibold text-slate-700 dark:text-slate-300">{region.regionLabel}</p>
                    <p className="mt-1 text-sm font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(region.amount)}</p>
                    <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                      自付 {region.copayPercent}%（約 {formatCurrency(region.selfPay)}）
                    </p>
                  </div>
                ))}
              </div>
              <CitationFooter officialUrl={schedule.transport.officialUrl} lastVerified={schedule.transport.lastVerified} />
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">輔具及居家無障礙環境改善服務（每3年）</h3>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">第一組（傳統輔具項目）</p>
                  <p className="mt-1 text-sm font-black text-indigo-600 dark:text-indigo-400">
                    {formatCurrency(estimate.assistiveDevice.groupOne.amount)}
                  </p>
                  <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                    自付 {estimate.assistiveDevice.groupOne.copayPercent}%（約 {formatCurrency(estimate.assistiveDevice.groupOne.selfPay)}）
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">
                    第二組（含智慧科技輔具租賃，{estimate.assistiveDevice.groupTwo.effectiveDate} 起）
                  </p>
                  <p className="mt-1 text-sm font-black text-indigo-600 dark:text-indigo-400">
                    {formatCurrency(estimate.assistiveDevice.groupTwo.amount)}
                  </p>
                  <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                    自付 {estimate.assistiveDevice.groupTwo.copayPercent}%（約 {formatCurrency(estimate.assistiveDevice.groupTwo.selfPay)}）
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                兩組擇一申請；第二組中，居家無障礙環境改善服務於三年期間另以 {formatCurrency(estimate.assistiveDevice.homeModificationCapWithinGroupTwo)} 為限。
              </p>
              <CitationFooter officialUrl={schedule.assistiveDevice.officialUrl} lastVerified={schedule.assistiveDevice.lastVerified} />
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">家庭照顧者支持服務之喘息服務（每年）</h3>
                <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(estimate.respite.amount)}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                自付 {estimate.respite.copayPercent}%（約 {formatCurrency(estimate.respite.selfPay)}），政府給付約{" "}
                {formatCurrency(estimate.respite.govPays)}
              </p>
              <CitationFooter officialUrl={schedule.respite.officialUrl} lastVerified={schedule.respite.lastVerified} />
            </div>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-xs font-semibold text-indigo-800 dark:border-indigo-900/50 dark:bg-indigo-950/20 dark:text-indigo-300">
          實際以照專評估與照顧計畫為準。
        </div>
      </section>

      {/* ========================================================= */}
      {/* 4. 申請窗口 */}
      {/* ========================================================= */}
      <section aria-labelledby="where-to-apply-title" className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 id="where-to-apply-title" className="text-xl font-bold text-slate-900 dark:text-white">
          申請窗口
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          可撥打 1966 長照專線，或向戶籍地、居住地的長期照顧管理中心申請。若需要社工進一步協助或不確定該找哪個單位，可查詢本站的社福中心與社工求助工具。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={appendOutboundUtm("https://1966.gov.tw/", { medium: "tool-apply-link" })}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-indigo-500"
          >
            1966 長照服務專區 ↗
          </a>
          <Link
            href="/tools/social-welfare-centers"
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-xs font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-50 dark:border-indigo-900/50 dark:bg-slate-900 dark:text-indigo-300"
          >
            社福中心與社工求助
          </Link>
        </div>
      </section>
    </div>
  );
}
