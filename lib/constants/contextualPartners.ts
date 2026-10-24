export type CivicPartnerId =
  | "metawilo"
  | "sports-coach"
  | "mohw-vio"
  | "moe-ece"
  | "sfaa-crc"
  | "kuma"
  | "anti-cw"
  | "g0v"
  | "council2026"
  | "msf-taiwan"
  | "amnesty-taiwan"
  | "taiwan-aid"
  | "icdf";

export interface ContextualPartnerConfig {
  id: CivicPartnerId;
  name: string;
  baseUrl: string;
  icon: string;
  badge: string;
  badgeColor: string;
  borderColor: string;
  hoverBorderColor: string;
  bgLinear: string;
  defaultTitle: string;
  defaultDescription: string;
  defaultActionText: string;
}

export const CONTEXTUAL_PARTNERS: Record<CivicPartnerId, ContextualPartnerConfig> = {
  metawilo: {
    id: "metawilo",
    name: "台灣罪犯圖鑑",
    baseUrl: "https://metawilo.com/",
    icon: "⚖️",
    badge: "兒少安全防護",
    badgeColor:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
    borderColor: "border-rose-200/80 dark:border-rose-900/50",
    hoverBorderColor: "hover:border-rose-400 dark:hover:border-rose-700",
    bgLinear:
      "from-rose-50/40 via-white to-slate-50/30 dark:from-rose-950/20 dark:via-slate-900/60 dark:to-slate-950/30",
    defaultTitle: "兒少校園安全防護線",
    defaultDescription:
      "守護孩童人身安全：除政府立案資格與警示點外，建議搭配台灣罪犯圖鑑查核司法判決紀錄。",
    defaultActionText: "前往查核",
  },
  "sports-coach": {
    id: "sports-coach",
    name: "運動部不適任教練專區",
    baseUrl: "https://www.sports.gov.tw/News/6295",
    icon: "🥋",
    badge: "體育安全防護",
    badgeColor:
      "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800",
    borderColor: "border-teal-200/80 dark:border-teal-900/50",
    hoverBorderColor: "hover:border-teal-400 dark:hover:border-teal-700",
    bgLinear:
      "from-teal-50/40 via-white to-slate-50/30 dark:from-teal-950/20 dark:via-slate-900/60 dark:to-slate-950/30",
    defaultTitle: "課後運動與體育教練安全查核",
    defaultDescription:
      "把關課後運動與才藝訓練安全：建議搭配運動部公告專區，查核是否有涉及違法事件之不適任教練。",
    defaultActionText: "查核不適任名單",
  },
  "mohw-vio": {
    id: "mohw-vio",
    name: "衛福部醫事性平專區",
    baseUrl: "https://ma.mohw.gov.tw/Accessibility/VIOSearch/MASearchVIO",
    icon: "🩺",
    badge: "就醫安全防護",
    badgeColor:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
    borderColor: "border-rose-200/80 dark:border-rose-900/50",
    hoverBorderColor: "hover:border-rose-400 dark:hover:border-rose-700",
    bgLinear:
      "from-rose-50/40 via-white to-slate-50/30 dark:from-rose-950/20 dark:via-slate-900/60 dark:to-slate-950/30",
    defaultTitle: "就醫安全與違法醫事人員查核",
    defaultDescription:
      "守護民眾就醫安全與身體自主權：建議就診前搭配衛福部專區，查核涉及性平事件之醫事人員確定案件名冊。",
    defaultActionText: "查核醫事性平名單",
  },
  "moe-ece": {
    id: "moe-ece",
    name: "教育部幼兒園裁罰專區",
    baseUrl: "https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx",
    icon: "🏫",
    badge: "幼教安全防護",
    badgeColor:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    borderColor: "border-amber-200/80 dark:border-amber-900/50",
    hoverBorderColor: "hover:border-amber-400 dark:hover:border-amber-700",
    bgLinear:
      "from-amber-50/40 via-white to-slate-50/30 dark:from-amber-950/20 dark:via-slate-900/60 dark:to-slate-950/30",
    defaultTitle: "幼兒園立案與裁罰安全查核",
    defaultDescription:
      "挑選園所與托育環境：除核准立案資料外，建議搭配教育部專區查核歷年裁罰紀錄與重大違規情事。",
    defaultActionText: "查核幼兒園裁罰名冊",
  },
  "sfaa-crc": {
    id: "sfaa-crc",
    name: "衛福部兒少法裁罰專區",
    baseUrl: "https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction",
    icon: "🚸",
    badge: "兒少權益防護",
    badgeColor:
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800",
    borderColor: "border-sky-200/80 dark:border-sky-900/50",
    hoverBorderColor: "hover:border-sky-400 dark:hover:border-sky-700",
    bgLinear:
      "from-sky-50/40 via-white to-slate-50/30 dark:from-sky-950/20 dark:via-slate-900/60 dark:to-slate-950/30",
    defaultTitle: "兒少身心防護與違規裁罰查核",
    defaultDescription:
      "守護孩子身心安全：建議前往衛福部社會及家庭署公告專區，查核涉及兒少法確定案件與機構公告名冊。",
    defaultActionText: "查核兒少法裁罰名單",
  },
  kuma: {
    id: "kuma",
    name: "黑熊學院",
    baseUrl: "https://kuma-academy.org/",
    icon: "🐻",
    badge: "全民防衛韌性",
    badgeColor:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    borderColor: "border-amber-200/80 dark:border-amber-900/50",
    hoverBorderColor: "hover:border-amber-400 dark:hover:border-amber-700",
    bgLinear:
      "from-amber-50/40 via-white to-slate-50/30 dark:from-amber-950/20 dark:via-slate-900/60 dark:to-slate-950/30",
    defaultTitle: "全民防衛與自主應變",
    defaultDescription:
      "除避難處所與急救醫療查詢，平時可前往黑熊學院學習急救止血、避難包準備與民防技能。",
    defaultActionText: "前往了解",
  },
  "anti-cw": {
    id: "anti-cw",
    name: "反認知作戰教育網",
    baseUrl: "https://cw.yueyuknows.com/",
    icon: "🛡️",
    badge: "資訊防衛素養",
    badgeColor:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
    borderColor: "border-blue-200/80 dark:border-blue-900/50",
    hoverBorderColor: "hover:border-blue-400 dark:hover:border-blue-700",
    bgLinear:
      "from-blue-50/40 via-white to-slate-50/30 dark:from-blue-950/20 dark:via-slate-900/60 dark:to-slate-950/30",
    defaultTitle: "建立數位免疫力",
    defaultDescription:
      "閱讀即時公衛與生活資訊時，前往反認知作戰教育資源網提升假訊息與資訊戰辨識能力。",
    defaultActionText: "前往學習",
  },
  g0v: {
    id: "g0v",
    name: "g0v 零時政府",
    baseUrl: "https://g0v.tw/intl/zh-TW/event/",
    icon: "🌐",
    badge: "開源公民協作",
    badgeColor:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
    borderColor: "border-emerald-200/80 dark:border-emerald-900/50",
    hoverBorderColor: "hover:border-emerald-400 dark:hover:border-emerald-700",
    bgLinear:
      "from-emerald-50/40 via-white to-slate-50/30 dark:from-emerald-950/20 dark:via-slate-900/60 dark:to-slate-950/30",
    defaultTitle: "開源公民科技與黑客松",
    defaultDescription:
      "參與 g0v 零時政府雙月大松、專案小聚與工作坊，以開源公民科技力量推動社會變革。",
    defaultActionText: "探索活動",
  },
  council2026: {
    id: "council2026",
    name: "2026 政治人物前科",
    baseUrl: "https://council2026.taiwangogo.tw/",
    icon: "🏛️",
    badge: "陽光政治監督",
    badgeColor:
      "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800",
    borderColor: "border-purple-200/80 dark:border-purple-900/50",
    hoverBorderColor: "hover:border-purple-400 dark:hover:border-purple-700",
    bgLinear:
      "from-purple-50/40 via-white to-slate-50/30 dark:from-purple-950/20 dark:via-slate-900/60 dark:to-slate-950/30",
    defaultTitle: "陽光政治與透明監督",
    defaultDescription:
      "除公益團體法人名錄與社福機構查核，前往 2026 政治人物前科查詢監督民意代表司法紀錄。",
    defaultActionText: "前往監督",
  },
  "msf-taiwan": {
    id: "msf-taiwan",
    name: "無國界醫生（台灣）",
    baseUrl: "https://www.msf.org.tw/",
    icon: "🩺",
    badge: "前線醫療援助",
    badgeColor:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800",
    borderColor: "border-red-200/80 dark:border-red-900/50",
    hoverBorderColor: "hover:border-red-400 dark:hover:border-red-700",
    bgLinear:
      "from-red-50/40 via-white to-slate-50/30 dark:from-red-950/20 dark:via-slate-900/60 dark:to-slate-950/30",
    defaultTitle: "全球前線緊急醫療與人道救援",
    defaultDescription:
      "獨立國際醫療人道組織前線動態：面對全球重大武裝衝突、流行病與天災，前往無國界醫生了解即時醫療援助專案與志工行動。",
    defaultActionText: "了解前線救援",
  },
  "amnesty-taiwan": {
    id: "amnesty-taiwan",
    name: "國際特赦組織台灣分會",
    baseUrl: "https://www.amnesty.tw/take-action",
    icon: "🕯️",
    badge: "人權行動連署",
    badgeColor:
      "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/60 dark:text-yellow-300 dark:border-yellow-800",
    borderColor: "border-yellow-200/80 dark:border-yellow-900/50",
    hoverBorderColor: "hover:border-yellow-400 dark:hover:border-yellow-700",
    bgLinear:
      "from-yellow-50/40 via-white to-slate-50/30 dark:from-yellow-950/20 dark:via-slate-900/60 dark:to-slate-950/30",
    defaultTitle: "全球人權連署與人道倡議",
    defaultDescription:
      "全球最大人權運動在臺分會：為良心犯與人權受害者發聲，前往特赦組織「採取行動」參與全球緊急救援個案連署。",
    defaultActionText: "即刻參與連署",
  },
  "taiwan-aid": {
    id: "taiwan-aid",
    name: "台灣海外援助發展聯盟",
    baseUrl: "https://www.aid.org.tw/",
    icon: "🤝",
    badge: "海外援助網絡",
    badgeColor:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
    borderColor: "border-emerald-200/80 dark:border-emerald-900/50",
    hoverBorderColor: "hover:border-emerald-400 dark:hover:border-emerald-700",
    bgLinear:
      "from-emerald-50/40 via-white to-slate-50/30 dark:from-emerald-950/20 dark:via-slate-900/60 dark:to-slate-950/30",
    defaultTitle: "臺灣海外援助發展聯盟網絡",
    defaultDescription:
      "匯聚全臺 30+ 從事國際人道援助與發展合作之 NGO 網絡，拓展跨國援助參與與國際志工機會。",
    defaultActionText: "探索援外網絡",
  },
  icdf: {
    id: "icdf",
    name: "國際合作發展基金會",
    baseUrl: "https://www.icdf.org.tw/",
    icon: "🌐",
    badge: "官方援外機構",
    badgeColor:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
    borderColor: "border-blue-200/80 dark:border-blue-900/50",
    hoverBorderColor: "hover:border-blue-400 dark:hover:border-blue-700",
    bgLinear:
      "from-blue-50/40 via-white to-slate-50/30 dark:from-blue-950/20 dark:via-slate-900/60 dark:to-slate-950/30",
    defaultTitle: "國合會國際合作與海外志工",
    defaultDescription:
      "臺灣專業對外援助機構：推動國際技術合作、公衛醫療與人道援助，提供海外志工與青年參與管道。",
    defaultActionText: "前往國合會",
  },
};

export function buildContextualPartnerUrl(
  rawUrl: string,
  subpath?: string,
  utmParams?: Record<string, string>
): string {
  try {
    const url = new URL(rawUrl);
    if (subpath) {
      if (subpath.startsWith("http://") || subpath.startsWith("https://")) {
        return subpath;
      }
      url.pathname = subpath.startsWith("/") ? subpath : `/${subpath}`;
    }
    const defaultParams: Record<string, string> = {
      utm_source: "health.j172.tw",
      utm_medium: "contextual_banner",
      utm_campaign: "civic_partner",
      ...utmParams,
    };
    for (const [k, v] of Object.entries(defaultParams)) {
      if (!url.searchParams.has(k)) {
        url.searchParams.set(k, v);
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}
