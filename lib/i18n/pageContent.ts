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

const PAGE_I18N_CONTENT: Record<
  "home" | "nearby" | "globalWatchEarthquakes" | "globalWatchTyphoons" | "globalWatchConflicts",
  Record<PathLocale, LocalizedPageMeta>
> = {
  home: {
    en: {
      title: "j172tw Healthz",
      description:
        "A hub for Taiwan's official public-health and medical news, ESG sustainability reporting, and the Central Weather Administration's real-time alerts, together with long-term care, child and youth welfare, health calculators, medical care, transportation, energy, disaster preparedness, and anti-fraud & addiction-support tools for everyday life.",
    },
    ja: {
      title: "j172tw Healthz",
      description:
        "台湾の公的機関による公衆衛生・医療ニュース、ESGサステナビリティ報道、中央気象署のリアルタイム警報を集約し、介護（長照）、児童・青少年福祉、健康計算、医療ケア、交通・エネルギー、防災警戒、詐欺対策・依存症支援などの生活支援ツールを提供する公共情報ハブです。",
    },
    ko: {
      title: "j172tw Healthz",
      description:
        "대만 공공기관의 공중보건·의료 뉴스, ESG 지속가능경영 보도, 중앙기상청의 실시간 경보를 종합하고, 장기요양, 아동·청소년 복지, 건강 계산, 의료·돌봄, 교통·에너지, 재난 대비, 사기 예방 및 중독 지원 등 생활 편의 도구를 제공하는 공공정보 허브입니다.",
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
  // Issue #593 (parent #583): the 颱風 global-watch item sub-route
  // (`/tools/global-watch/typhoons`) — same reasoning as
  // "globalWatchEarthquakes" above: not a TranslatedToolSlug, not a
  // TOOL_CATALOG entry, so it needs its own per-locale title/description.
  globalWatchTyphoons: {
    en: {
      title: "Global Watch: Typhoons — West Pacific (CWA) & Worldwide Tropical Cyclones (GDACS)",
      shortTitle: "Typhoons",
      description:
        "Active tropical cyclones on an interactive 3D globe: West Pacific typhoons from Taiwan's Central Weather Administration (name, current position, forecast track) and every other basin's storms from GDACS — each cyclone shown from exactly one source, never duplicated.",
    },
    ja: {
      title: "グローバルウォッチ：台風 — 西太平洋（気象署）と世界の熱帯低気圧（GDACS）",
      shortTitle: "台風",
      description:
        "インタラクティブな3D地球儀上で活動中の熱帯低気圧を表示。西太平洋の台風は台湾中央気象署のデータ（名称・現在位置・予報経路）、他の海域はGDACSのデータを使用し、同じ台風が二重に表示されないようにしています。",
    },
    ko: {
      title: "글로벌 워치: 태풍 — 서태평양(기상청)과 전 세계 열대성 저기압(GDACS)",
      shortTitle: "태풍",
      description:
        "인터랙티브 3D 지구본에 활동 중인 열대성 저기압을 표시합니다. 서태평양 태풍은 대만 중앙기상청 데이터(명칭·현재 위치·예상 경로)를, 그 외 해역은 GDACS 데이터를 사용하여 같은 태풍이 중복 표시되지 않도록 합니다.",
    },
  },
  // Issue #774 (parent #773): the sixth global-watch item sub-route
  // (`/tools/global-watch/conflicts`) — same reasoning as every entry
  // above: not a TranslatedToolSlug, not a TOOL_CATALOG entry. GDELT-only
  // for now (UCDP is #775, still blocked) — the description below says so
  // explicitly rather than implying broader coverage than this ticket ships.
  globalWatchConflicts: {
    en: {
      title: "Global Watch: Conflicts — GDELT Armed-Conflict Events on a 3D Globe",
      shortTitle: "Conflicts",
      description:
        "Armed-conflict events reported by GDELT (filtered to CAMEO's FIGHT / mass-violence categories only) plotted on an interactive 3D globe, each linking back to its original news source — relayed open data, not this site's own political judgment.",
    },
    ja: {
      title: "グローバルウォッチ：武力衝突 — GDELTによる武力衝突事件の3D地球儀表示",
      shortTitle: "武力衝突",
      description:
        "GDELTが報じた武力衝突関連の事件（CAMEOのFIGHT／大規模暴力カテゴリーのみに絞り込み）をインタラクティブな3D地球儀上に表示し、各マーカーから元の報道記事にリンクします。本サイト独自の政治的判断ではなく、転載されたオープンデータです。",
    },
    ko: {
      title: "글로벌 워치: 무력 충돌 — GDELT 기반 무력 충돌 사건 3D 지구본",
      shortTitle: "무력 충돌",
      description:
        "GDELT가 보도한 무력 충돌 사건(CAMEO의 FIGHT·대규모 폭력 범주로만 한정)을 인터랙티브 3D 지구본에 표시하며, 각 마커는 원래 뉴스 출처로 연결됩니다. 본 사이트의 정치적 판단이 아니라 전재된 공개 데이터입니다.",
    },
  },
};

export function getLocalizedPageMeta(
  page: "home" | "nearby" | "globalWatchEarthquakes" | "globalWatchTyphoons" | "globalWatchConflicts",
  locale: PathLocale,
): LocalizedPageMeta {
  return PAGE_I18N_CONTENT[page][locale];
}
