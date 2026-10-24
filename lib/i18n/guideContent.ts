import type { PathLocale } from "./dictionary";

/**
 * Issue #487: full en/ja/ko translations for the "颱風地震來了"
 * (typhoon-earthquake) life-situation guide — one of this ticket's two
 * non-tool, non-/tools/<slug> pages (the other is "/nearby"). The issue's
 * acceptance criteria require this guide's foreign-language version to be
 * exactly as complete as the Chinese one, not an abbreviated summary, so
 * every one of GUIDES's 8 step captions/why-texts and all 3 FAQs are
 * translated below, matching navModel.ts's `typhoon-earthquake` entry
 * field-for-field.
 *
 * Each step is keyed by its real `toolSlug` (navModel.ts's GUIDES array is
 * the single source of truth for step order/count) so a locale guide page
 * can zip this against `GUIDES.find(g => g.slug === "typhoon-earthquake")`
 * without duplicating step order here.
 */
export const TRANSLATED_GUIDE_SLUGS = ["typhoon-earthquake"] as const;
export type TranslatedGuideSlug = (typeof TRANSLATED_GUIDE_SLUGS)[number];

export function isTranslatedGuideSlug(slug: string): slug is TranslatedGuideSlug {
  return (TRANSLATED_GUIDE_SLUGS as readonly string[]).includes(slug);
}

export interface LocalizedGuideStep {
  caption: string;
  why: string;
}

export interface LocalizedGuideMeta {
  title: string;
  description: string;
  steps: Record<string, LocalizedGuideStep>;
  faqs: { question: string; answer: string }[];
}

const GUIDE_I18N_CONTENT: Record<TranslatedGuideSlug, Record<PathLocale, LocalizedGuideMeta>> = {
  "typhoon-earthquake": {
    en: {
      title: "When a Typhoon or Earthquake Hits",
      description:
        "Before and after a typhoon, earthquake, or other natural disaster, what a user needs most is information that quickly connects warnings, evacuation, and daily-life support. This guide orders its tools by \"prepare beforehand → respond during the event → cope with daily life afterward.\"",
      steps: {
        "weather-alerts": {
          caption: "Watch weather alerts",
          why: "Typhoons, heavy rain, and similar disasters usually come with advance warning — continuously watching live weather alerts and rainfall information is the earliest first-hand information available for disaster preparation.",
        },
        "work-school-status": {
          caption: "Check whether work and classes are suspended",
          why: "Once a typhoon warning is out, the most practical question is whether you work or study tomorrow. Each county or city government decides, and the DGPA publishes the result; this step gives you the way to the official announcement and the government office calendar. This site does not determine suspensions — rely on the official announcement before you head out.",
        },
        "accessible-transit": {
          caption: "Check railway and transit suspensions",
          why: "During a typhoon or severe earthquake, Taiwan Railway, High Speed Rail, and local metro systems often reduce service, slow down, or suspend operations for safety inspections. Check real-time disruption notices before heading out to avoid getting stranded at stations, and use official customer service hotlines to confirm refund policies and shuttle arrangements.",
        },
        "global-watch": {
          caption: "Check the latest earthquake information",
          why: "Earthquakes can't be warned about in advance, but right after one strikes you can immediately check the epicenter, magnitude, depth, and any tsunami warning, helping you decide whether further evacuation or aftershock precautions are needed.",
        },
        "disaster-map": {
          caption: "Find the nearest evacuation map",
          why: "If your home or location faces a safety risk during a disaster, the disaster-relief evacuation map helps you quickly find the nearest shelter and disaster-relief resources.",
        },
        "inundation-map": {
          caption: "Check real-time flooding conditions",
          why: "During heavy rain or a typhoon, road flooding and water-level warnings are the most direct risk in many areas — a real-time sensor map helps you judge which roads to avoid.",
        },
        "water-outages": {
          caption: "Track water outages and water-collection points",
          why: "A disaster is often followed by water outages or pipe repairs — a real-time water-outage map shows planned outage areas and alternative water-collection points, so your household water supply doesn't cut off without warning.",
        },
        "emergency-supplies": {
          caption: "Prepare disaster supplies",
          why: "Calculating how much emergency-kit and household-reserve supplies your household needs ahead of time ensures you have enough at the critical moment, rather than scrambling to buy supplies after a disaster has already happened.",
        },
        "emergency-hotlines": {
          caption: "Save emergency phone numbers",
          why: "The last line of defense in disaster response is being able to reach the right agency immediately — this collects nationwide emergency hotlines like 110, 119, 112, and 1999; it's best to save them to your phone in advance.",
        },
      },
      faqs: [
        {
          question: "How quickly is earthquake data updated?",
          answer:
            "This site's earthquake data automatically syncs the latest readings from the Central Weather Administration and the US Geological Survey (USGS) every 10 minutes, so near-real-time information is still available during the golden window for response after a typhoon or major earthquake.",
        },
        {
          question: "How much disaster supply should I prepare?",
          answer:
            "The emergency-kit and household-reserve calculator estimates a recommended amount based on your household size (including whether there are infants, elders, or pets), rather than giving one fixed list that fits everyone — adjust based on the tool's calculated result.",
        },
        {
          question: "Are the flood-warning lookup and the water-outage lookup the same system?",
          answer:
            "No, they draw on different data sources: the flooding map combines road-flooding sensors and water-level flood-warning data, while the water-outage map comes from the water utility's planned-outage and pipe-repair notices — it's best to check both during a disaster, since they cover different kinds of risk.",
        },
      ],
    },
    ja: {
      title: "台風・地震が来たら",
      description:
        "台風や地震などの自然災害の前後、利用者が最も必要とするのは、警報、避難、生活支援の情報をすばやく結びつけてくれる情報です。本ガイドは「事前準備 → 発生時の対応 → 事後の生活」の順にツールを並べています。",
      steps: {
        "weather-alerts": {
          caption: "気象警報を確認する",
          why: "台風や大雨などの災害には多くの場合事前の警告があります。リアルタイムの気象警報と降雨情報を継続的に確認することが、災害対応の準備で最初に得られる一次情報です。",
        },
        "work-school-status": {
          caption: "休業・休校の有無を確認する",
          why: "台風警報が出たあと、最も現実的な疑問は明日出勤・登校するかどうかです。休業・休校は各県市政府が決定し、人事行政総処が公表します。このステップでは公式発表への入口と政府機関の執務カレンダーを案内します。本サイトは休業・休校を判定しませんので、外出前に必ず公式発表をご確認ください。",
        },
        "accessible-transit": {
          caption: "鉄道と公共交通機関の運行停止を確認する",
          why: "台風や強い地震の際、台湾鉄道、高鉄、各地下鉄は強風豪雨や線路点検により減便、徐行、または全線運休を実施することがあります。外出前にリアルタイムの運行情報や運休告知を確認し、駅での立ち往生を防ぎましょう。公式カスタマーセンターへの連絡で払い戻しや代替バスの確認も可能です。",
        },
        "global-watch": {
          caption: "最新の地震情報を確認する",
          why: "地震は事前に警告できませんが、発生後すぐに震源地、規模、深さ、津波警報を確認することで、さらなる避難や余震への備えが必要かどうかを判断できます。",
        },
        "disaster-map": {
          caption: "最寄りの避難マップを確認する",
          why: "災害発生時に自宅や現在地に安全上のリスクがある場合、防災避難マップは最寄りの避難所と防災資源の位置をすばやく見つけるのに役立ちます。",
        },
        "inundation-map": {
          caption: "リアルタイムの浸水状況を確認する",
          why: "大雨や台風の際、道路の浸水や水位警戒は多くの地域で最も直接的なリスクです。リアルタイムセンサーマップは、どの道路を避けるべきか判断するのに役立ちます。",
        },
        "water-outages": {
          caption: "断水情報と給水ポイントを確認する",
          why: "災害後には断水や配管修理がよく発生します。リアルタイム断水マップでは計画断水の範囲と代替の給水ポイントを確認でき、生活用水が予告なく止まることを防げます。",
        },
        "emergency-supplies": {
          caption: "防災物資を準備する",
          why: "事前に家族の人数に応じて必要な非常持ち出し袋と家庭備蓄品の数量を計算しておくことで、災害後に慌てて買い出しするよりも、重要な局面で物資を確保しやすくなります。",
        },
        "emergency-hotlines": {
          caption: "緊急連絡先を控えておく",
          why: "災害対応の最後の防衛線は、適切な機関にすぐ連絡できることです。ここでは110、119、112、1999など全国の緊急ホットラインをまとめています。事前に携帯電話に登録しておくことをお勧めします。",
        },
      },
      faqs: [
        {
          question: "地震データはどのくらいの頻度で更新されますか？",
          answer:
            "本サイトの地震データは中央気象署と米国地質調査所（USGS）の最新測定結果を10分ごとに自動同期しており、台風や強い地震の後の黄金対応時間内でも、ほぼリアルタイムの情報を参照できます。",
        },
        {
          question: "防災物資はどのくらい準備すればよいですか？",
          answer:
            "非常持ち出し袋と家庭備蓄品の計算機は、家族の人数（乳幼児、高齢者、ペットの有無を含む）に応じて推奨量を算出するもので、全員に当てはまる固定リストではありません。ツールの算出結果に応じて調整することをお勧めします。",
        },
        {
          question: "浸水警戒情報と断水情報は同じシステムですか？",
          answer:
            "いいえ、データの出典が異なります。浸水マップは道路浸水センサーと水位の防汛警戒データを統合したもので、断水マップは水道会社の計画断水と配管修理の告知によるものです。災害時はどちらも確認することをお勧めします。それぞれ異なるリスクの側面を把握できます。",
        },
      ],
    },
    ko: {
      title: "태풍·지진이 닥쳤을 때",
      description:
        "태풍, 지진 등 자연재해 전후에 사용자가 가장 필요로 하는 것은 경보, 대피, 생활 지원 정보를 빠르게 연결해 주는 정보입니다. 이 가이드는 '사전 준비 → 발생 시 대응 → 이후 생활'의 순서로 도구를 배열했습니다.",
      steps: {
        "weather-alerts": {
          caption: "기상 경보 확인하기",
          why: "태풍, 폭우 등의 재해는 대부분 사전 경고가 있습니다. 실시간 기상 경보와 강우 정보를 지속적으로 확인하는 것이 재해 대응 준비에서 가장 먼저 얻을 수 있는 1차 정보입니다.",
        },
        "work-school-status": {
          caption: "휴무·휴교 여부 확인하기",
          why: "태풍 경보가 발령되면 가장 현실적인 질문은 내일 출근·등교하느냐입니다. 휴무·휴교는 각 현·시 정부가 결정하고 인사행정총처가 공표합니다. 이 단계에서는 공식 공고로 가는 입구와 정부기관 근무일 달력을 안내합니다. 이 사이트는 휴무·휴교를 판정하지 않으므로 외출 전에 반드시 공식 공고를 확인하세요.",
        },
        "accessible-transit": {
          caption: "철도 및 대중교통 운행 중단 확인하기",
          why: "태풍이나 강진 발생 시 대만철도, 고속철도, 각 지하철 시스템은 강풍과 호우 또는 선로 점검으로 인해 감차, 서행 또는 전면 운행 중단을 시행할 수 있습니다. 외출 전에 실시간 운행 지연 및 중단 공고를 확인하여 역에서 발이 묶이는 상황을 방지하고, 공식 고객센터를 통해 환불 및 대체 셔틀 조치를 확인하세요.",
        },
        "global-watch": {
          caption: "최신 지진 정보 조회하기",
          why: "지진은 사전에 경고할 수 없지만, 발생 직후 진앙, 규모, 깊이, 해일 경보를 즉시 확인하여 추가 대피나 여진 대비가 필요한지 판단하는 데 도움이 됩니다.",
        },
        "disaster-map": {
          caption: "가장 가까운 대피 지도 확인하기",
          why: "재해 발생 시 자택이나 현재 위치에 안전 위험이 있다면, 방재 대피 지도가 가장 가까운 대피소와 방재 자원의 위치를 빠르게 찾는 데 도움이 됩니다.",
        },
        "inundation-map": {
          caption: "실시간 침수 현황 확인하기",
          why: "폭우나 태풍 시 도로 침수와 수위 경계는 많은 지역에서 가장 직접적인 위험입니다. 실시간 센서 지도는 어떤 도로를 피해야 할지 판단하는 데 도움이 됩니다.",
        },
        "water-outages": {
          caption: "단수 정보와 급수 지점 확인하기",
          why: "재해 이후에는 단수나 배관 복구가 흔히 발생합니다. 실시간 단수 지도로 계획 단수 구역과 대체 급수 지점을 확인하면 생활용수가 예고 없이 끊기는 상황을 피할 수 있습니다.",
        },
        "emergency-supplies": {
          caption: "방재 물품 준비하기",
          why: "사전에 가구원 수에 맞춰 필요한 비상 대피 가방과 가정 비축 물품의 수량을 계산해 두면, 재해 이후에 급하게 구매하는 것보다 중요한 순간에 물품을 충분히 확보할 수 있습니다.",
        },
        "emergency-hotlines": {
          caption: "긴급 연락처 저장해두기",
          why: "재해 대응의 마지막 방어선은 올바른 기관에 즉시 연락할 수 있는 것입니다. 여기에는 110, 119, 112, 1999 등 전국 긴급 전화번호가 정리되어 있으니 미리 휴대폰에 저장해 두는 것을 권장합니다.",
        },
      },
      faqs: [
        {
          question: "지진 데이터는 얼마나 빨리 업데이트되나요?",
          answer:
            "본 사이트의 지진 데이터는 중앙기상청과 미국지질조사국(USGS)의 최신 관측 결과를 10분마다 자동으로 동기화하여, 태풍이나 강진 이후 골든타임 내에도 거의 실시간에 가까운 정보를 참고할 수 있습니다.",
        },
        {
          question: "방재 물품은 얼마나 준비해야 충분한가요?",
          answer:
            "비상 대피 가방과 가정 비축 물품 계산기는 가구원 수(영유아, 고령자, 반려동물 유무 포함)에 따라 권장 수량을 산출하는 것으로, 모두에게 적용되는 고정된 목록이 아닙니다. 도구의 계산 결과에 따라 조정하는 것을 권장합니다.",
        },
        {
          question: "침수 경계 조회와 단수 조회는 같은 시스템인가요?",
          answer:
            "아닙니다. 두 시스템은 데이터 출처가 다릅니다. 침수 지도는 도로 침수 센서와 수위 방재 경계 데이터를 통합한 것이고, 단수 지도는 수도 회사의 계획 단수 및 배관 복구 공고에서 가져온 것입니다. 재해 기간에는 두 가지를 모두 확인하는 것이 좋습니다. 서로 다른 위험 측면을 파악할 수 있습니다.",
        },
      ],
    },
  },
};

export function getLocalizedGuideMeta(slug: TranslatedGuideSlug, locale: PathLocale): LocalizedGuideMeta {
  return GUIDE_I18N_CONTENT[slug][locale];
}
