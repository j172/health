import type {
  FraudDomainsTrendSummary,
  PoliceFraudInterdictionStatsRow,
  FscFraudAdStatsRow,
} from "@/lib/server/antiFraud/trendQueries";

/**
 * Presentational-only section for issue #570's "最新詐騙趨勢" acceptance
 * criterion — a plain server component, no DB access of its own (the
 * page fetches everything via lib/server/antiFraud/trendQueries.ts and
 * passes the results in as props, same split as every other DB-backed tool
 * page section in this repo). Renders three independent pieces, each of
 * which can be empty on its own (e.g. a fresh DB before the first sync has
 * run) without blanking the other two.
 */

const nf = new Intl.NumberFormat("zh-TW");
const currency = (n: number | null): string => (n === null ? "—" : `NT$ ${nf.format(n)}`);
const count = (n: number | null): string => (n === null ? "—" : nf.format(n));

/** "11509" (民國年月) -> "民國115年09月". Same convention as AntiFraudChecker.tsx's formatReportedYearMonth. */
function formatYearMonth(raw: string): string {
  const match = /^(\d{2,3})(\d{2})$/.exec(raw.trim());
  if (!match) return raw;
  return `民國${match[1]}年${match[2]}月`;
}

function formatRocMonth(rocYear: number, rocMonth: number): string {
  return `民國${rocYear}年${String(rocMonth).padStart(2, "0")}月`;
}

export default function FraudTrendsSection({
  fraudDomains,
  policeStats,
  fscStats,
}: {
  fraudDomains: FraudDomainsTrendSummary;
  policeStats: PoliceFraudInterdictionStatsRow[];
  fscStats: FscFraudAdStatsRow[];
}) {
  const hasAnyData =
    fraudDomains.latestYearMonth !== null || policeStats.length > 0 || fscStats.length > 0;

  if (!hasAnyData) return null;

  const latestMonthCount =
    fraudDomains.monthlyCounts.find((m) => m.yearMonth === fraudDomains.latestYearMonth)
      ?.domainCount ?? null;
  const latestPolice = policeStats[0] ?? null;
  const latestFsc = fscStats[0] ?? null;

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
      aria-labelledby="fraud-trends-heading"
    >
      <h2
        id="fraud-trends-heading"
        className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"
      >
        <span>📈</span>
        <span>最新詐騙趨勢</span>
      </h2>

      {fraudDomains.latestYearMonth && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {formatYearMonth(fraudDomains.latestYearMonth)}新增停止解析網域數
          </p>
          <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">
            {count(latestMonthCount)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">個</span>
          </p>
          {fraudDomains.monthlyCounts.length > 1 && (
            <ul className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              {fraudDomains.monthlyCounts
                .slice()
                .reverse()
                .map((m) => (
                  <li
                    key={m.yearMonth}
                    className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800"
                  >
                    {formatYearMonth(m.yearMonth)}：{count(m.domainCount)}
                  </li>
                ))}
            </ul>
          )}

          {fraudDomains.siteNatureDistribution.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {formatYearMonth(fraudDomains.latestYearMonth)}網站性質分布
              </p>
              <ul className="mt-2 space-y-1">
                {fraudDomains.siteNatureDistribution.map((n) => (
                  <li
                    key={n.siteNature}
                    className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400"
                  >
                    <span>{n.siteNature}</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {count(n.domainCount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {latestPolice && (
        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            內政部警政署 {formatRocMonth(latestPolice.rocYear, latestPolice.rocMonth)}打詐成效
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">查緝犯罪集團</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-200">{count(latestPolice.gangCount)} 團</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">查緝人數</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-200">{count(latestPolice.memberCount)} 人</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">查扣不法所得</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-200">{currency(latestPolice.seizedAmountNtd)}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">攔阻金額</dt>
              <dd className="font-semibold text-emerald-700 dark:text-emerald-400">{currency(latestPolice.blockedAmountNtd)}</dd>
            </div>
          </dl>
        </div>
      )}

      {latestFsc && (
        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            金融監督管理委員會 {latestFsc.reportDate} 違規投資廣告週報
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">本週新增件數</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-200">{count(latestFsc.weeklyNewCount)} 件</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">較前期增減</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-200">
                {latestFsc.changePct === null ? "—" : `${latestFsc.changePct > 0 ? "+" : ""}${latestFsc.changePct}%`}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">累計案件數</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-200">{count(latestFsc.cumulativeCount)} 件</dd>
            </div>
          </dl>
        </div>
      )}

      <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">
        資料來源：內政部警政署「165反詐騙諮詢專線_遭停止解析涉詐網站」「打詐儀錶板打擊詐欺成效」、金融監督管理委員會「打詐儀表板」開放資料。
      </p>
    </section>
  );
}
