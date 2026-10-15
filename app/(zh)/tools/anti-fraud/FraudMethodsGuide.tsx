import { appendOutboundUtm } from "@/lib/format/outboundLink";

/**
 * Static "常見手法與應變" section for issue #570. No DB access — every
 * fact here is written from verified official-source content (165 全民防騙網
 * and 金管會 the two cited authorities below, researched 2026-10-14/15), not
 * invented copy. Kept as plain static JSX (not a catalog-driven FAQ list)
 * since this needs richer formatting (辨識重點 bullet lists + a distinct
 * 應變步驟 block) than ToolCatalogEntry.faqs's flat Q/A shape supports.
 */

interface FraudMethod {
  title: string;
  summary: string;
  identifyPoints: string[];
  sourceLabel: string;
  sourceUrl: string;
}

const METHODS: FraudMethod[] = [
  {
    title: "假投資",
    summary:
      "詐騙集團透過社群廣告、簡訊或 LINE 主動搭訕，邀請加入「投資群組」操作外匯、虛擬貨幣或股票，初期刻意讓小額獲利出金取信，等被害人投入大筆資金後，平台即失聯或無法出金。",
    identifyPoints: [
      "標榜「保證獲利」「穩賺不賠」「老師帶單」的投資機會，高獲利必定伴隨高風險，沒有保證獲利的合法投資",
      "投資前先查核該平台或業者是否為合法立案金融機構（可查詢中華民國證券投資信託暨顧問商業同業公會等公會名冊）",
      "被要求下載來路不明的 App 或到非正規交易所操作，是常見詐騙管道",
    ],
    sourceLabel: "165全民防騙網",
    sourceUrl: "https://165.npa.gov.tw/",
  },
  {
    title: "解除分期付款",
    summary:
      "詐騙集團冒充電商客服、物流或銀行人員來電，謊稱訂單設定錯誤、重複扣款或誤設分期，要求立即到 ATM 或網路銀行「解除設定」，實際上是誘導被害人依指示操作轉帳。",
    identifyPoints: [
      "ATM 和網路銀行都沒有「解除分期付款」或「取消扣款」的功能，接到這類來電就是詐騙",
      "任何要求「跟著步驟操作 ATM 或網銀才能取消」的來電，應立即掛斷",
      "真正的客服不會主動來電要求操作提款機或提供驗證碼",
    ],
    sourceLabel: "165全民防騙網",
    sourceUrl: "https://165.npa.gov.tw/",
  },
  {
    title: "假網拍",
    summary:
      "在社群買賣社團、一頁式廣告或私訊中，以明顯低於市價的商品吸引買家，要求透過 LINE、臉書私下匯款交易，付款後商品不寄出或已經失聯。",
    identifyPoints: [
      "價格明顯低於市價、賣家堅持私下匯款而非使用平台內建金流或貨到付款，都是警訊",
      "盡量在信譽良好的正規購物平台交易，避免跳出平台私下轉帳",
      "交易前可先用賣家帳號、LINE ID 或電話到 165 全民防騙網查詢是否已被通報",
    ],
    sourceLabel: "165全民防騙網",
    sourceUrl: "https://165.npa.gov.tw/",
  },
  {
    title: "假冒公務員",
    summary:
      "詐騙集團冒充檢警、金管會或銀行局人員來電，聲稱被害人帳戶異常、已列為警示帳戶或涉及刑案，要求提供帳戶、密碼、一次性驗證碼，或將款項匯入所謂的「安全帳戶」配合查證。",
    identifyPoints: [
      "金管會與銀行局公開強調「三個不會」：不會主動聯繫民眾、不會要求管制或凍結民眾帳戶、不會以任何理由要求民眾匯款或繳交保證金",
      "司法機關不會透過電話要求「自證清白」或指示將款項轉入指定帳戶",
      "接到這類電話應直接掛斷，改撥 165 或原機關公開電話查證，不要回撥來電顯示的號碼",
    ],
    sourceLabel: "金融監督管理委員會",
    sourceUrl: "https://www.fsc.gov.tw/",
  },
  {
    title: "假交友",
    summary:
      "在交友軟體或社群平台冒用他人照片，長期經營感情互動取得信任後，以關稅、結婚基金、投資獲利等理由誘導被害人匯款，最終常導向假投資詐騙。",
    identifyPoints: [
      "對方長期不願意視訊、見面，或見面理由屢屢落空，應提高警覺",
      "交往過程中切勿透露過多個人與財務資訊，更不要依對方指示操作投資或匯款",
      "一旦對方以任何理由要求金錢往來，應先暫停聯繫並向 165 查證",
    ],
    sourceLabel: "165全民防騙網",
    sourceUrl: "https://165.npa.gov.tw/",
  },
];

interface ResponseStep {
  step: string;
  description: string;
  sourceLabel: string;
  sourceUrl: string;
}

const RESPONSE_STEPS: ResponseStep[] = [
  {
    step: "撥打165查證或求助",
    description:
      "無論是尚在查證可疑訊息，還是已經確定受騙，第一步都是撥打 165 反詐騙諮詢專線（免付費），說明情況並依指示處理。",
    sourceLabel: "165全民防騙網",
    sourceUrl: "https://165.npa.gov.tw/",
  },
  {
    step: "立即聯繫銀行申請圈存止扣",
    description:
      "已經匯款的話，立刻聯繫原匯出銀行的客服或分行，說明是詐騙匯款，請銀行協助圈存（保留帳戶內尚未被轉出的款項）並止扣，愈早處理愈有機會追回部分款項。",
    sourceLabel: "金融監督管理委員會",
    sourceUrl: "https://www.fsc.gov.tw/",
  },
  {
    step: "向警察機關報案",
    description: "到就近派出所或撥打 110 報案，取得受理案件證明單（三聯單），這是後續申請圈存、保險理賠或其他求助程序常需要的文件。",
    sourceLabel: "165全民防騙網",
    sourceUrl: "https://165.npa.gov.tw/",
  },
  {
    step: "保留所有證據",
    description:
      "完整保留對話紀錄（簡訊、LINE、通話紀錄）、匯款憑證、對方帳號與 LINE ID、網站或廣告截圖，不要刪除，這些都是報案與追查的關鍵證據。",
    sourceLabel: "165全民防騙網",
    sourceUrl: "https://165.npa.gov.tw/",
  },
];

function SourceLink({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={appendOutboundUtm(url, { medium: "fraud_methods_guide", campaign: "anti_fraud_tool" })}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
    >
      資料來源：{label} ↗
    </a>
  );
}

export default function FraudMethodsGuide() {
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
      aria-labelledby="fraud-methods-heading"
    >
      <h2
        id="fraud-methods-heading"
        className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"
      >
        <span>🛡️</span>
        <span>常見手法與辨識重點</span>
      </h2>

      <div className="mt-4 space-y-4">
        {METHODS.map((method) => (
          <div
            key={method.title}
            className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-850"
          >
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">{method.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{method.summary}</p>
            <ul className="mt-2 space-y-1">
              {method.identifyPoints.map((point) => (
                <li key={point} className="flex items-start gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="mt-0.5 text-indigo-500 dark:text-indigo-400">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px]">
              <SourceLink label={method.sourceLabel} url={method.sourceUrl} />
            </p>
          </div>
        ))}
      </div>

      <h3 className="mt-6 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
        <span>🚨</span>
        <span>發現被騙後的應變步驟</span>
      </h3>
      <ol className="mt-3 space-y-3">
        {RESPONSE_STEPS.map((item, index) => (
          <li
            key={item.step}
            className="flex gap-3 rounded-xl border border-amber-200/80 bg-amber-50/50 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/30"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
              {index + 1}
            </span>
            <div>
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200">{item.step}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">{item.description}</p>
              <p className="mt-1.5 text-[11px]">
                <SourceLink label={item.sourceLabel} url={item.sourceUrl} />
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
