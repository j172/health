import { useMemo } from "react";
import { isGovSource } from "@/lib/server/news/sourceCategories";
import { getSourceLabel } from "@/lib/server/news/sourceLabels";

export interface ThematicCoverProps {
  sourceName: string;
  title: string;
  deptName?: string | null;
  compact?: boolean;
  heroMode?: boolean;
}

interface ThemeConfig {
  gradientClass: string;
  accentColor: string;
  agencyBadge: string;
  categoryLabel: string;
  iconSvg: (accent: string) => React.ReactNode;
}

const THEMES: Record<string, ThemeConfig> = {
  // 疾管署 (CDC) - 防疫盾牌與心電波形
  cdc: {
    gradientClass: "from-emerald-950 via-teal-900 to-slate-950",
    accentColor: "#34d399",
    agencyBadge: "衛生福利部疾病管制署",
    categoryLabel: "疫情通報 • 公共衛生公報",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <path
          d="M50 15 L80 28 V50 C80 68 66 82 50 88 C34 82 20 68 20 50 V28 Z"
          stroke={accent}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M32 52 H42 L46 42 L54 62 L58 52 H68"
          stroke={accent}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="50" cy="50" r="35" stroke={accent} strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
      </svg>
    ),
  },

  // 食藥署 (TFDA) - 食安藥品檢驗章與微分子幾何
  tfda: {
    gradientClass: "from-amber-950 via-orange-950 to-slate-950",
    accentColor: "#fbbf24",
    agencyBadge: "衛生福利部食品藥物管理署",
    categoryLabel: "食品藥物安全 • 稽查公報",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="34" stroke={accent} strokeWidth="3" strokeDasharray="6 3" />
        <circle cx="50" cy="50" r="26" stroke={accent} strokeWidth="1.5" opacity="0.6" />
        <path
          d="M40 50 L47 57 L62 42"
          stroke={accent}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M50 12 V20 M50 80 V88 M12 50 H20 M80 50 H88" stroke={accent} strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },

  // 健保署 (NHI) - 雙手守護與健保十字
  nhi: {
    gradientClass: "from-blue-950 via-cyan-950 to-slate-950",
    accentColor: "#38bdf8",
    agencyBadge: "衛生福利部中央健康保險署",
    categoryLabel: "全民健保 • 醫療政策專訊",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <rect x="42" y="24" width="16" height="52" rx="4" fill={accent} fillOpacity="0.25" stroke={accent} strokeWidth="3" />
        <rect x="24" y="42" width="52" height="16" rx="4" fill={accent} fillOpacity="0.25" stroke={accent} strokeWidth="3" />
        <circle cx="50" cy="50" r="38" stroke={accent} strokeWidth="1.5" opacity="0.4" />
      </svg>
    ),
  },

  // 國健署 (HPA) - 全人身心健康與生命之樹脈動
  hpa: {
    gradientClass: "from-teal-950 via-emerald-950 to-slate-950",
    accentColor: "#4ade80",
    agencyBadge: "衛生福利部國民健康署",
    categoryLabel: "健康促進 • 預防醫學指引",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <path
          d="M50 78 C50 78 24 58 24 38 C24 26 34 18 45 22 C48 23 50 26 50 26 C50 26 52 23 55 22 C66 18 76 26 76 38 C76 58 50 78 50 78 Z"
          stroke={accent}
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path d="M50 40 V65 M42 50 L50 42 L58 50" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },

  // 環境部 / 氣象署 (MOENV / CWA / WATER) - 氣象水紋與等壓線
  moenv: {
    gradientClass: "from-sky-950 via-slate-900 to-slate-950",
    accentColor: "#0ea5e9",
    agencyBadge: "環境部公開資訊",
    categoryLabel: "環境品質監測 • 生態公報",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <path d="M20 40 Q50 25 80 40 T20 60 T80 60" stroke={accent} strokeWidth="2.5" fill="none" opacity="0.7" />
        <circle cx="50" cy="50" r="16" stroke={accent} strokeWidth="2.5" fill={accent} fillOpacity="0.1" />
        <path d="M50 20 V30 M50 70 V80 M20 50 H30 M70 50 H80" stroke={accent} strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  cwa: {
    gradientClass: "from-indigo-950 via-sky-950 to-slate-950",
    accentColor: "#38bdf8",
    agencyBadge: "中央氣象署氣象特報",
    categoryLabel: "即時天氣特報 • 氣象資訊",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <path
          d="M32 60 A14 14 0 0 1 38 34 A20 20 0 0 1 72 40 A14 14 0 0 1 68 60 Z"
          stroke={accent}
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path d="M38 68 L34 76 M50 68 L46 76 M62 68 L58 76" stroke={accent} strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
  },
  water_gov: {
    gradientClass: "from-cyan-950 via-slate-900 to-slate-950",
    accentColor: "#06b6d4",
    agencyBadge: "台灣自來水公司",
    categoryLabel: "水質監測 • 供水公告",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <path
          d="M50 20 C50 20 28 50 28 64 A22 22 0 0 0 72 64 C72 50 50 20 50 20 Z"
          stroke={accent}
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },

  // 衛福部本會與社會家庭署 (MOHW / SFAA) - 國家權威衛政公報
  mohw: {
    gradientClass: "from-slate-950 via-emerald-950 to-slate-900",
    accentColor: "#10b981",
    agencyBadge: "衛生福利部",
    categoryLabel: "國家衛生福利政策 • 官方公報",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="36" stroke={accent} strokeWidth="3" />
        <path d="M50 22 V78 M22 50 H78" stroke={accent} strokeWidth="2.5" strokeDasharray="4 2" />
        <polygon points="50,30 66,42 66,66 50,74 34,66 34,42" stroke={accent} strokeWidth="2" fill={accent} fillOpacity="0.15" />
      </svg>
    ),
  },
  sfaa: {
    gradientClass: "from-slate-950 via-teal-950 to-slate-900",
    accentColor: "#2dd4bf",
    agencyBadge: "衛生福利部社會及家庭署",
    categoryLabel: "兒少社福 • 家庭關懷指引",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <circle cx="36" cy="38" r="10" stroke={accent} strokeWidth="3" />
        <circle cx="64" cy="42" r="8" stroke={accent} strokeWidth="2.5" />
        <path d="M22 68 C22 54 34 50 36 50 C44 50 50 56 50 68" stroke={accent} strokeWidth="3" strokeLinecap="round" />
        <path d="M52 68 C52 58 60 54 64 54 C72 54 78 60 78 68" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },

  // 醫療院所 (長庚、榮總、亞東) - 臨床醫療與健康專訊
  cgmh: {
    gradientClass: "from-slate-950 via-blue-950 to-slate-900",
    accentColor: "#60a5fa",
    agencyBadge: "長庚紀念醫院",
    categoryLabel: "醫學中心 • 臨床衛教專訊",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <rect x="25" y="25" width="50" height="50" rx="8" stroke={accent} strokeWidth="3" />
        <path d="M50 35 V65 M35 50 H65" stroke={accent} strokeWidth="4" strokeLinecap="round" />
      </svg>
    ),
  },
  vghtpe: {
    gradientClass: "from-slate-950 via-indigo-950 to-slate-900",
    accentColor: "#818cf8",
    agencyBadge: "臺北榮民總醫院",
    categoryLabel: "國家級醫學中心 • 醫療新知",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="32" stroke={accent} strokeWidth="3" />
        <path d="M50 28 V72 M28 50 H72" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    ),
  },
  femh: {
    gradientClass: "from-slate-950 via-sky-950 to-slate-900",
    accentColor: "#38bdf8",
    agencyBadge: "亞東紀念醫院",
    categoryLabel: "醫學中心 • 醫學研究成果",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="30" stroke={accent} strokeWidth="2.5" />
        <path d="M40 40 L60 60 M60 40 L40 60" stroke={accent} strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
  },

  // 天下雜誌 CSR (CSR@天下) - 永續循環與生態葉脈
  csr_cw: {
    gradientClass: "from-slate-950 via-emerald-950 to-teal-950",
    accentColor: "#34d399",
    agencyBadge: "CSR@天下",
    categoryLabel: "永續發展 • 企業社會責任",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <path d="M50 20 C33 20 20 33 20 50 C20 67 33 80 50 80 C67 80 80 67 80 50" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeDasharray="12 4" />
        <path d="M50 28 C50 28 35 45 50 65 C65 45 50 28 50 28 Z" stroke={accent} strokeWidth="3" strokeLinejoin="round" fill={accent} fillOpacity="0.15" />
        <path d="M50 36 V58" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },

  // 康健雜誌 (Common Health) - 身心靈全人健康與樂活蓮華
  commonhealth: {
    gradientClass: "from-amber-950 via-orange-950 to-slate-900",
    accentColor: "#f97316",
    agencyBadge: "康健雜誌",
    categoryLabel: "健康生活 • 全人身心靈",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="32" stroke={accent} strokeWidth="2" strokeDasharray="4 4" />
        <path d="M50 24 C40 38 40 54 50 68 C60 54 60 38 50 24 Z" stroke={accent} strokeWidth="3" fill={accent} fillOpacity="0.2" />
        <path d="M30 52 C44 42 60 42 70 52" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
  commonhealth_club: {
    gradientClass: "from-amber-950 via-orange-950 to-slate-900",
    accentColor: "#fb923c",
    agencyBadge: "康健大人社團",
    categoryLabel: "熟齡生活 • 活力身心學堂",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="34" stroke={accent} strokeWidth="2.5" />
        <path d="M35 55 C45 42 55 42 65 55" stroke={accent} strokeWidth="3" strokeLinecap="round" />
        <circle cx="50" cy="38" r="8" stroke={accent} strokeWidth="2.5" fill={accent} fillOpacity="0.2" />
      </svg>
    ),
  },

  // 早安健康 (EDH) - 晨曦日光與預防養生
  edh: {
    gradientClass: "from-emerald-950 via-teal-950 to-slate-900",
    accentColor: "#10b981",
    agencyBadge: "早安健康",
    categoryLabel: "預防醫學 • 每日健康養生",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="46" r="18" stroke={accent} strokeWidth="3" fill={accent} fillOpacity="0.2" />
        <path d="M22 68 Q50 54 78 68" stroke={accent} strokeWidth="3.5" strokeLinecap="round" />
        <path d="M50 18 V26 M28 26 L34 32 M72 26 L66 32" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },

  // 遠見健康 / ESG 遠見 (GVM) - 前瞻趨勢視野
  health_gvm: {
    gradientClass: "from-slate-950 via-cyan-950 to-blue-950",
    accentColor: "#06b6d4",
    agencyBadge: "健康遠見",
    categoryLabel: "前瞻趨勢 • 深度專題報導",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="32" stroke={accent} strokeWidth="3" />
        <polygon points="50,26 56,44 74,50 56,56 50,74 44,56 26,50 44,44" stroke={accent} strokeWidth="2" fill={accent} fillOpacity="0.2" />
      </svg>
    ),
  },
  esg_gvm: {
    gradientClass: "from-slate-950 via-teal-950 to-slate-900",
    accentColor: "#14b8a6",
    agencyBadge: "ESG遠見",
    categoryLabel: "永續前瞻 • 綠色策略專題",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="30" stroke={accent} strokeWidth="2.5" strokeDasharray="6 3" />
        <path d="M38 58 L50 32 L62 58 Z" stroke={accent} strokeWidth="3" strokeLinejoin="round" fill={accent} fillOpacity="0.15" />
      </svg>
    ),
  },

  // 關鍵評論網 (The News Lens) - 深度透鏡與公共時事
  thenewslens: {
    gradientClass: "from-rose-950 via-slate-900 to-slate-950",
    accentColor: "#f43f5e",
    agencyBadge: "關鍵評論網",
    categoryLabel: "公共議題 • 深度觀點剖析",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <circle cx="45" cy="45" r="22" stroke={accent} strokeWidth="3.5" />
        <path d="M61 61 L78 78" stroke={accent} strokeWidth="4.5" strokeLinecap="round" />
        <path d="M36 45 H54 M45 36 V54" stroke={accent} strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },

  // 元氣網（聯合報健康）/ 倡議家 - 活力心律與長照新知
  udn_health: {
    gradientClass: "from-slate-950 via-orange-950 to-slate-900",
    accentColor: "#fb923c",
    agencyBadge: "元氣網",
    categoryLabel: "醫藥新知 • 專業長照指引",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="34" stroke={accent} strokeWidth="2.5" />
        <path d="M26 50 H38 L44 34 L54 66 L62 50 H74" stroke={accent} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  ubrand_udn: {
    gradientClass: "from-slate-950 via-amber-950 to-slate-900",
    accentColor: "#f59e0b",
    agencyBadge: "倡議家",
    categoryLabel: "永續倡議 • 社會共好行動",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <polygon points="50,22 76,70 24,70" stroke={accent} strokeWidth="3" strokeLinejoin="round" fill={accent} fillOpacity="0.15" />
        <circle cx="50" cy="52" r="6" fill={accent} />
      </svg>
    ),
  },

  // 健康醫療網 - 臨床醫藥與權威專訊
  healthnews: {
    gradientClass: "from-blue-950 via-indigo-950 to-slate-950",
    accentColor: "#60a5fa",
    agencyBadge: "健康醫療網",
    categoryLabel: "臨床醫學 • 權威醫藥焦點",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <rect x="25" y="25" width="50" height="50" rx="8" stroke={accent} strokeWidth="3" />
        <path d="M50 35 V65 M35 50 H65" stroke={accent} strokeWidth="4" strokeLinecap="round" />
        <circle cx="50" cy="50" r="18" stroke={accent} strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
    ),
  },

  // 50+（熟齡世代）- 年輪智慧與優雅慢老
  fiftyplus: {
    gradientClass: "from-amber-950 via-yellow-950 to-slate-900",
    accentColor: "#eab308",
    agencyBadge: "50+ 熟齡專區",
    categoryLabel: "熟齡生活 • 優雅慢老智慧",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="35" stroke={accent} strokeWidth="2.5" />
        <circle cx="50" cy="50" r="25" stroke={accent} strokeWidth="2" strokeDasharray="4 2" />
        <circle cx="50" cy="50" r="15" stroke={accent} strokeWidth="1.5" />
      </svg>
    ),
  },

  // TVBS 健康2.0 - 名醫養生與電視生活醫學
  tvbs_health: {
    gradientClass: "from-slate-950 via-red-950 to-slate-900",
    accentColor: "#ef4444",
    agencyBadge: "TVBS 健康2.0",
    categoryLabel: "生活醫學 • 名醫養生指南",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <rect x="22" y="26" width="56" height="48" rx="8" stroke={accent} strokeWidth="3" />
        <polygon points="44,38 62,50 44,62" fill={accent} fillOpacity="0.4" stroke={accent} strokeWidth="2" />
      </svg>
    ),
  },

  // Heho健康 - 健康圖解與實用醫學
  heho: {
    gradientClass: "from-teal-950 via-cyan-950 to-slate-950",
    accentColor: "#2dd4bf",
    agencyBadge: "Heho健康",
    categoryLabel: "健康圖解 • 實用醫學生活",
    iconSvg: (accent) => (
      <svg className="h-full w-full opacity-35" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="32" stroke={accent} strokeWidth="3" />
        <path d="M34 50 L46 62 L66 38" stroke={accent} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
};

// 預設官方公報風格
const DEFAULT_GOV_THEME: ThemeConfig = {
  gradientClass: "from-emerald-950 via-slate-900 to-slate-950",
  accentColor: "#10b981",
  agencyBadge: "政府公開資訊",
  categoryLabel: "官方公報 • 公共衛生資訊",
  iconSvg: (accent) => (
    <svg className="h-full w-full opacity-30" viewBox="0 0 100 100" fill="none">
      <path d="M20 40 L50 20 L80 40 V45 H20 Z" stroke={accent} strokeWidth="3" strokeLinejoin="round" />
      <rect x="26" y="48" width="8" height="28" stroke={accent} strokeWidth="2" />
      <rect x="46" y="48" width="8" height="28" stroke={accent} strokeWidth="2" />
      <rect x="66" y="48" width="8" height="28" stroke={accent} strokeWidth="2" />
      <rect x="18" y="78" width="64" height="6" stroke={accent} strokeWidth="2" />
    </svg>
  ),
};

// 預設民間媒體無圖風格
const DEFAULT_MEDIA_THEME: ThemeConfig = {
  gradientClass: "from-slate-950 via-indigo-950 to-slate-900",
  accentColor: "#818cf8",
  agencyBadge: "健康醫療新聞",
  categoryLabel: "焦點報導 • 專題深入剖析",
  iconSvg: (accent) => (
    <svg className="h-full w-full opacity-25" viewBox="0 0 100 100" fill="none">
      <rect x="22" y="24" width="56" height="52" rx="4" stroke={accent} strokeWidth="2.5" />
      <path d="M30 36 H70 M30 46 H58 M30 56 H66 M30 66 H50" stroke={accent} strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

export default function ThematicCover({
  sourceName,
  title,
  deptName,
  compact = false,
  heroMode = false,
}: ThematicCoverProps) {
  const isGov = isGovSource(sourceName);
  const theme = useMemo(() => {
    if (THEMES[sourceName]) {
      return THEMES[sourceName];
    }
    if (isGov) {
      const label = getSourceLabel(sourceName);
      return {
        ...DEFAULT_GOV_THEME,
        agencyBadge: label || DEFAULT_GOV_THEME.agencyBadge,
      };
    }
    const label = getSourceLabel(sourceName);
    return {
      ...DEFAULT_MEDIA_THEME,
      agencyBadge: label || DEFAULT_MEDIA_THEME.agencyBadge,
    };
  }, [sourceName, isGov]);

  if (heroMode) {
    return (
      <div
        className={`relative flex h-full w-full overflow-hidden bg-gradient-to-br ${theme.gradientClass} select-none`}
      >
        {/* Background SVG Grid pattern */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#ffffff0e_1px,transparent_1px)] [background-size:16px_16px] opacity-75" />

        {/* Large Thematic Watermark Vector in the background */}
        <div className="pointer-events-none absolute -right-6 -bottom-6 h-64 w-64 sm:h-80 sm:w-80 opacity-40">
          {theme.iconSvg(theme.accentColor)}
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br ${theme.gradientClass} p-2 text-center select-none`}
      >
        <div className="absolute inset-0 flex items-center justify-center p-1">
          {theme.iconSvg(theme.accentColor)}
        </div>
        <span
          className="relative z-10 text-[10px] font-bold tracking-tight text-white/90 drop-shadow-xs line-clamp-1"
          style={{ color: theme.accentColor }}
        >
          {theme.agencyBadge}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br ${theme.gradientClass} p-4 text-left select-none`}
    >
      {/* Background SVG Grid pattern */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:12px_12px] opacity-70" />

      {/* Large Thematic Watermark Vector in the background */}
      <div className="pointer-events-none absolute -right-3 -bottom-3 h-36 w-36 sm:h-44 sm:w-44">
        {theme.iconSvg(theme.accentColor)}
      </div>

      {/* Top Header: Badge & Category */}
      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-0.5 backdrop-blur-md">
          <span className="text-xs">{isGov ? "🏛️" : "📰"}</span>
          <span className="text-[11px] font-bold tracking-wider text-white">
            {theme.agencyBadge}
          </span>
        </div>
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[9px] font-medium tracking-widest text-white/70 uppercase">
          {isGov ? "OFFICIAL" : "REPORT"}
        </span>
      </div>

      {/* Center: Title / Subject in Executive Whitepaper Style */}
      <div className="relative z-10 my-auto py-2">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug tracking-tight text-white/95 drop-shadow-xs sm:text-base">
          {title}
        </h3>
        {deptName ? (
          <p className="mt-1 text-[10px] font-medium text-white/70 line-clamp-1">
            發布科室：{deptName}
          </p>
        ) : null}
      </div>

      {/* Bottom Footer: Authority Category & Official Publication Seal */}
      <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-2 text-[10px] text-white/60">
        <span className="font-medium tracking-wide" style={{ color: theme.accentColor }}>
          {theme.categoryLabel}
        </span>
        <span className="font-mono text-[9px] tracking-wider text-white/40">
          HEALTHZ GAZETTE
        </span>
      </div>
    </div>
  );
}
