import { appendOutboundUtm } from "@/lib/format/outboundLink";

/**
 * Issue #570 acceptance criterion: "電話和 LINE ID 只做外連...並附 UTM；
 * 不爬取它們的內部 API". 165 全民防騙網's own phone/LINE-ID lookup and the
 * 165 打詐儀表板 have no documented public API (#562's spec explicitly rules
 * scraping their internal frontend APIs out of scope), so this is
 * deliberately nothing more than two outbound buttons.
 */

interface HotlineLink {
  label: string;
  description: string;
  url: string;
}

const LINKS: HotlineLink[] = [
  {
    label: "165全民防騙網：查詢電話／LINE ID",
    description: "到 165 全民防騙網查詢可疑電話號碼或 LINE ID 是否已被民眾通報為詐騙。",
    url: "https://165.npa.gov.tw/",
  },
  {
    label: "165打詐儀表板",
    description: "查看內政部警政署彙整的全國打詐即時統計與趨勢儀表板。",
    url: "https://165dashboard.tw/",
  },
];

export default function FraudHotlineLinks() {
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
      aria-labelledby="fraud-hotline-links-heading"
    >
      <h2
        id="fraud-hotline-links-heading"
        className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"
      >
        <span>📞</span>
        <span>電話／LINE ID 查詢</span>
      </h2>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
        本工具只比對網址，可疑的電話號碼或 LINE ID 請前往官方頁面查詢，本站不會爬取它們的內部資料。
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {LINKS.map((link) => (
          <a
            key={link.url}
            href={appendOutboundUtm(link.url, { medium: "hotline_outbound", campaign: "anti_fraud_tool" })}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50/60 p-4 transition-all hover:border-indigo-200 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-850 dark:hover:border-indigo-900/50 dark:hover:bg-indigo-950/30"
          >
            <span className="text-xs font-semibold text-slate-800 group-hover:text-indigo-600 dark:text-slate-200 dark:group-hover:text-indigo-400">
              {link.label} ↗
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">{link.description}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
