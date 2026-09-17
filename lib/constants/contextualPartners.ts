export type CivicPartnerId =
  | "metawilo"
  | "kuma"
  | "anti-cw"
  | "g0v"
  | "council2026";

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
