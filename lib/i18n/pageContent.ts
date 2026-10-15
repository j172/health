import type { PathLocale } from "./dictionary";

/**
 * Issue #487: page-level title/description for the standalone (non-tool)
 * translated pages — the homepage ("/") and "/nearby". Mirrors
 * `lib/i18n/toolContent.ts`'s shape/intent for `/tools/<slug>` pages, kept
 * as its own file because these two pages aren't `TranslatedToolSlug`s (see
 * `TRANSLATED_STANDALONE_PATHS` in lib/i18n/translatedPages.ts) — neither
 * has a `TOOL_CATALOG` entry to read a zh baseline from, nor a FAQ list, so
 * `LocalizedToolMeta`'s shape doesn't fit either.
 */
export interface LocalizedPageMeta {
  title: string;
  description: string;
  /** Short form of `title` for use as an <h1>/breadcrumb label where the
   * full SEO title (used in <title>/OG tags) would be too long — mirrors
   * the zh page's own 首頁 pattern of "我附近：一次定位看全部急用點位" (metadata
   * title) vs. "我附近" (<h1>/breadcrumb). Only set where the two differ. */
  shortTitle?: string;
}

const PAGE_I18N_CONTENT: Record<"home" | "nearby" | "globalWatchEarthquakes", Record<PathLocale, LocalizedPageMeta>> = {
  home: {
    en: {
      title: "j172tw Healthz",
      description:
        "A hub for Taiwan's official public-health and medical news, ESG sustainability reporting, and the Central Weather Administration's real-time alerts, together with health, transportation, energy, and disaster-preparedness tools for everyday life.",
    },
    ja: {
      title: "j172tw Healthz",
      description:
        "台湾の公的機関による公衆衛生・医療ニュース、ESGサステナビリティ報道、中央気象署のリアルタイム警報を集約し、健康計算、医療・介護、交通・エネルギー、防災警戒などの生活支援ツールを提供する公共情報ハブです。",
    },
    ko: {
      title: "j172tw Healthz",
      description:
        "대만 공공기관의 공중보건·의료 뉴스, ESG 지속가능경영 보도, 중앙기상청의 실시간 경보를 종합하고, 건강 계산, 의료·돌봄, 교통·에너지, 재난 대비 등 생활 편의 도구를 제공하는 공공정보 허브입니다.",
    },
  },
  nearby: {
    en: {
      title: "Near Me: One Location Fix, All Urgent Points at Once",
      shortTitle: "Near Me",
      description:
        "Get your location once to simultaneously search AED, clinics, pharmacies, public restrooms, cool spots, accessible ATMs, real-time ER congestion, and shelters — each showing the nearest 3 results with distance, with more facility types available to expand.",
    },
    ja: {
      title: "我附近（マイエリア）：一度の位置情報で全ての緊急ポイントを確認",
      shortTitle: "マイエリア",
      description:
        "位置情報を一度取得するだけで、AED、診療所、薬局、公共トイレ、涼適点、バリアフリーATM、救急外来のリアルタイム混雑状況、避難所などの緊急ポイントを同時に検索。各カテゴリーの最寄り3件と距離を表示し、さらに多くの施設タイプを展開して確認できます。",
    },
    ko: {
      title: "내 주변: 한 번의 위치 확인으로 모든 긴급 지점 보기",
      shortTitle: "내 주변",
      description:
        "위치를 한 번만 확인하면 AED, 의료기관, 약국, 공중화장실, 쾌적 쉼터, 무장애 ATM, 응급실 실시간 혼잡도, 대피소 등 긴급 지점을 동시에 조회할 수 있습니다. 각 유형별로 가장 가까운 3곳과 거리를 표시하며, 더 많은 시설 유형도 펼쳐서 확인할 수 있습니다.",
    },
  },
  // Issue #588 (parent #583): the first global-watch item sub-route
  // (`/tools/global-watch/earthquakes`). Not a TranslatedToolSlug (see
  // lib/i18n/translatedPages.ts's TRANSLATED_STANDALONE_PATHS comment on
  // why) and not a TOOL_CATALOG entry, so it needs its own per-locale
  // title/description here rather than going through getLocalizedToolMeta.
  globalWatchEarthquakes: {
    en: {
      title: "Global Watch: Earthquakes — Worldwide & Taiwan Significant Earthquake Tracker",
      shortTitle: "Earthquakes",
      description:
        "Real-time significant earthquakes from the past 7 days — M4.0+ in Taiwan and M6.0+ worldwide — plotted on an interactive 3D globe (worldwide M4.5+ and Taiwan M4.0+ shown as globe markers), with epicenter, magnitude, depth, and tsunami-warning details.",
    },
    ja: {
      title: "グローバルウォッチ：地震 — 台湾と世界の有意地震トラッカー",
      shortTitle: "地震",
      description:
        "過去7日間の有意な地震（台湾でM4.0以上、世界でM6.0以上）をインタラクティブな3D地球儀上に表示（地球儀には世界M4.5以上・台湾M4.0以上を表示）。震源地・規模・深さ・津波警報情報を提供します。",
    },
    ko: {
      title: "글로벌 워치: 지진 — 대만 및 전 세계 주요 지진 트래커",
      shortTitle: "지진",
      description:
        "최근 7일간의 주요 지진(대만 M4.0 이상, 전 세계 M6.0 이상)을 인터랙티브 3D 지구본에 표시합니다（지구본에는 전 세계 M4.5 이상・대만 M4.0 이상을 표시). 진앙, 규모, 깊이, 해일 경보 정보를 제공합니다.",
    },
  },
};

export function getLocalizedPageMeta(
  page: "home" | "nearby" | "globalWatchEarthquakes",
  locale: PathLocale,
): LocalizedPageMeta {
  return PAGE_I18N_CONTENT[page][locale];
}
