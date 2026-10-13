import { TOOL_CATALOG, type ToolFaq } from "@/lib/server/tools/catalog";
import type { PathLocale } from "./dictionary";
import type { TranslatedToolSlug } from "./translatedPages";

export interface LocalizedToolMeta {
  title: string;
  description: string;
  directAnswer: string;
  faqs: ToolFaq[];
}

/**
 * Full en/ja/ko content for the 3 pilot tool pages (issue #485). Scope per
 * the issue: title, description, one-sentence answer, and FAQ get a real
 * human-reviewable translation; government data embedded in the page body
 * (institution names, addresses, phone numbers from government-hotlines.json
 * / the facilities DB) stays in Chinese verbatim — see AedContent.tsx,
 * EmergencyRoomContent.tsx, and EmergencyHotlinesContent.tsx, which add an
 * English-labelled category badge plus "Copy address" / "Google Maps
 * Navigation" buttons next to that untranslated data instead.
 *
 * zh-TW itself is never a key here — it always comes straight from
 * TOOL_CATALOG, which remains the single source of truth for the Chinese
 * baseline every locale's content is reviewed against.
 */
const TOOL_I18N_CONTENT: Record<TranslatedToolSlug, Record<PathLocale, LocalizedToolMeta>> = {
  aed: {
    en: {
      title: "Nationwide Public AED (Defibrillator) Map",
      description:
        "Find the nearest publicly accessible Automated External Defibrillator (AED) in Taiwan in real time — exact placement, operating hours, and an emergency management contact number — combined with GPS to help reach it within the critical first 4 minutes. Supports live open/closed status.",
      directAnswer:
        "An AED (Automated External Defibrillator) is the key device for treating sudden cardiac arrest. This tool locates the nearest AED in real time, shows its exact placement (e.g. next to the information desk), and flags whether it is currently accessible.",
      faqs: [
        {
          question: "What is an AED, and who can use one?",
          answer:
            "An AED (Automated External Defibrillator) is designed for use by anyone, not just medical professionals. Once switched on, it gives step-by-step voice instructions — attach the pads, stand clear, press the shock button. Good Samaritan legal protections apply, so any member of the public can use one without hesitation.",
        },
        {
          question: "Why filter for devices that are \"currently open\"?",
          answer:
            "Some AEDs are installed inside schools, office buildings, or specific sports venues that lock up at night or on holidays. This tool checks the current time against each site's opening hours so rescuers aren't sent to a locked location, protecting the critical first 4 minutes.",
        },
        {
          question: "What's the AED first-aid mnemonic?",
          answer:
            "The mnemonic is \"Call, Call, C, D\": Call out (check consciousness and breathing) -> Call for help (have someone call 119 and fetch an AED) -> C (continue chest compressions / CPR) -> D (Defibrillation - switch on the AED and follow its voice prompts).",
        },
      ],
    },
    ja: {
      title: "全国AEDマップ（公共施設の自動体外式除細動器）",
      description:
        "全国の公共施設に設置されたAED（自動体外式除細動器）の設置場所、詳しい設置位置、利用可能時間、緊急管理連絡先をリアルタイムで検索。GPSと連動し、黄金の4分間で救命できるようサポートします。開館・閉館状況も自動判定します。",
      directAnswer:
        "AED（自動体外式除細動器）は心臓突然死を救う重要な機器です。本ツールは最寄りのAEDをリアルタイムで検索し、設置場所の詳細（例：受付カウンター横）を表示、現在利用可能かどうかも自動で判定します。",
      faqs: [
        {
          question: "AEDとは何ですか？誰が使用できますか？",
          answer:
            "AED（Automated External Defibrillator）は医療従事者でなくても使用できるように設計された除細動器です。電源を入れると音声ガイダンスが流れ、「パッドを貼る」「患者から離れる」「ボタンを押す」と指示してくれます。緊急時の救助行為は法律で保護されており（善きサマリア人の精神）、一般の方も安心して使用できます。",
        },
        {
          question: "「現在利用可能」で絞り込む理由は？",
          answer:
            "一部のAEDは学校や施設内、特定のスポーツ施設に設置されており、夜間や休日は施錠されていることがあります。本ツールは現在時刻と各施設の開館時間を照合し、施錠された場所へ向かってしまうことを防ぎ、貴重な黄金の4分間を確保します。",
        },
        {
          question: "AED救命の合言葉は？",
          answer:
            "合言葉は「呼ぶ・呼ぶ・C・D」です。呼ぶ（意識と呼吸を確認）→呼ぶ（周囲に119通報とAEDの手配を依頼）→C（胸骨圧迫＝CPRを継続）→D（Defibrillation＝AEDの電源を入れ音声指示に従う）。",
        },
      ],
    },
    ko: {
      title: "전국 공공장소 AED(자동심장충격기) 지도",
      description:
        "전국 공공장소에 설치된 자동심장충격기(AED)의 위치, 정확한 설치 위치, 이용 가능 시간, 긴급 관리 연락처를 실시간으로 조회할 수 있습니다. GPS와 연동하여 골든타임 4분 안에 구조할 수 있도록 지원하며, 현재 이용 가능 여부도 자동으로 표시됩니다.",
      directAnswer:
        "AED(자동심장충격기)는 심장마비 환자를 구하는 핵심 장비입니다. 이 도구는 가장 가까운 AED를 실시간으로 찾아주고, 정확한 설치 위치(예: 안내데스크 옆)를 보여주며, 현재 바로 사용할 수 있는지 여부를 표시합니다.",
      faqs: [
        {
          question: "AED란 무엇이며 누가 사용할 수 있나요?",
          answer:
            "AED(Automated External Defibrillator)는 의료 전문가가 아니어도 사용할 수 있도록 설계된 심장충격기입니다. 전원을 켜면 \"패드를 붙이세요\", \"환자에게서 떨어지세요\", \"충격 버튼을 누르세요\" 등 음성 안내가 순서대로 나옵니다. 응급 구조 행위는 법적으로 보호받으므로(선한 사마리아인 법), 일반 사용자도 안심하고 사용할 수 있습니다.",
        },
        {
          question: "'현재 이용 가능'으로 필터링하는 이유는 무엇인가요?",
          answer:
            "일부 AED는 학교, 기관 건물, 특정 체육시설 내부에 설치되어 있어 야간이나 공휴일에는 잠겨 있을 수 있습니다. 이 도구는 현재 시각과 각 장소의 운영 시간을 비교하여, 구조자가 잠긴 장소로 헛걸음하지 않도록 하고 소중한 골든타임 4분을 지켜줍니다.",
        },
        {
          question: "AED 응급처치 구호는 무엇인가요?",
          answer:
            "구호는 '부르기, 부르기, C, D'입니다: 부르기(의식과 호흡 확인) → 부르기(주변 사람에게 119 신고와 AED 요청) → C(CPR, 가슴 압박 계속) → D(Defibrillation, AED를 켜고 음성 안내를 따르기).",
        },
      ],
    },
  },
  "er-status": {
    en: {
      title: "Nationwide Emergency Room Real-Time Status Board",
      description:
        "A live feed from Taiwan's Ministry of Health and Welfare covering every major- and intermediate-level emergency-responsibility hospital nationwide: numbers waiting for consultation, waiting for a bed, waiting for admission, and waiting for an ICU bed, plus \"119 ambulance diversion\" notices, with a 24-hour trend chart to help choose a less busy time to go.",
      directAnswer:
        "This page aggregates real-time data from 200+ emergency-responsibility hospitals nationwide, auto-syncing every 15 minutes: numbers waiting for consultation, for a bed, ICU vacancy, and 119 full-capacity diversion notices, plus a 24-hour trend chart to help choose a less crowded time to visit.",
      faqs: [
        {
          question: "How often is the emergency-room data updated?",
          answer:
            "Data syncs automatically every 15 minutes from Taiwan's National Health Insurance Administration and each emergency-responsibility hospital's own reporting, reflecting current numbers waiting for consultation, for a bed, and for admission.",
        },
        {
          question: "What does a \"119 full-capacity notice\" mean?",
          answer:
            "When an emergency room becomes severely congested and its staff and beds are fully occupied, the hospital notifies the local fire department's 119 dispatch center, which then diverts non-life-threatening patients by ambulance to other emergency-responsibility hospitals instead.",
        },
        {
          question: "When should someone go to the emergency room?",
          answer:
            "Emergency rooms triage by severity and treat life-threatening cases first. Go immediately for a persistent high fever, severe chest pain, acute difficulty breathing, loss of consciousness, or serious trauma. For a common cold or mild discomfort, a daytime visit to a regular clinic allows more thorough care and eases pressure on the emergency room.",
        },
      ],
    },
    ja: {
      title: "全国救急責任病院 救急外来リアルタイム掲示板",
      description:
        "衛生福利部（厚生福祉省）と全国の重度・中度救急責任病院をリアルタイムで接続し、診察待ち人数、ストレッチャー待ち人数、入院待ち人数、ICU待ち人数、119受け入れ停止通知を提供。24時間の混雑推移グラフも表示し、混雑を避けた受診の参考にできます。",
      directAnswer:
        "本サイトは全国200以上の救急責任病院のデータを集約し、15分ごとに自動更新。診察待ち人数、ストレッチャー数、ICU空床状況、119受け入れ停止通知を表示し、過去24時間の推移グラフで混雑を避けた受診時間を検討できます。",
      faqs: [
        {
          question: "救急外来の情報はどのくらいの頻度で更新されますか？",
          answer:
            "本サイトのデータは健康保険署および各救急責任病院からの最新報告を15分ごとに自動同期し、現場の診察待ち、ストレッチャー待ち、入院待ち人数を反映しています。",
        },
        {
          question: "「119受け入れ停止通知」とは何ですか？",
          answer:
            "救急外来が極度に混雑し、人員やストレッチャーが満杯になった場合、病院は各地域の消防局119指令センターへ受け入れ停止を通知します。これにより、生命に直結しない傷病者は救急車で他の責任病院へ搬送されます。",
        },
        {
          question: "どのような場合に救急外来を受診すべきですか？",
          answer:
            "救急外来はトリアージにより重症患者を優先します。持続する高熱、激しい胸痛、急性呼吸困難、意識障害、重度の外傷などは直ちに受診してください。一般的な風邪や軽い不調であれば、日中に地域のクリニックを受診する方が十分な診察時間を確保でき、救急外来の混雑緩和にもつながります。",
        },
      ],
    },
    ko: {
      title: "전국 응급실 실시간 현황판",
      description:
        "보건복지부와 전국 중증·중등도 응급의료 책임병원을 실시간으로 연계하여 진료 대기 인원, 이동식 침대 대기 인원, 입원 대기 인원, 중환자실(ICU) 대기 인원 및 119 수용 중단 통보 정보를 제공합니다. 24시간 혼잡도 추이 그래프도 함께 제공하여 혼잡 시간을 피해 방문할 수 있도록 돕습니다.",
      directAnswer:
        "이 페이지는 전국 200개 이상의 응급의료 책임병원 데이터를 15분마다 자동으로 동기화하여 집계합니다. 진료 대기 인원, 이동식 침대 수, 중환자실 여유 병상, 119 수용 중단 통보를 보여주며, 24시간 추이 그래프로 혼잡을 피해 방문할 시간을 확인할 수 있습니다.",
      faqs: [
        {
          question: "응급실 실시간 정보는 얼마나 자주 업데이트되나요?",
          answer:
            "본 사이트 데이터는 건강보험공단 및 각 응급의료 책임병원의 최신 통보를 15분마다 자동으로 동기화하여, 현장의 진료 대기, 이동식 침대 대기, 입원 대기 인원을 반영합니다.",
        },
        {
          question: "'119 수용 중단 통보'란 무엇인가요?",
          answer:
            "응급실이 극도로 혼잡해져 인력과 이동식 침대가 가득 찼을 때, 병원은 각 지역 소방서 119 구급상황관리센터에 수용 중단을 통보합니다. 이후 생명에 즉각적인 위험이 없는 환자는 구급차로 다른 책임병원으로 분산 이송됩니다.",
        },
        {
          question: "어떤 경우에 응급실을 가야 하나요?",
          answer:
            "응급실은 중증도에 따라 생명이 위급한 환자를 우선 치료합니다. 지속되는 고열, 심한 가슴 통증, 급성 호흡곤란, 의식 저하, 심한 외상 등이 있다면 즉시 응급실을 방문하세요. 가벼운 감기나 경미한 불편함이라면 낮 시간에 동네 병·의원을 방문하는 것이 더 충분한 진료 시간을 확보할 수 있고 응급실 혼잡도 줄일 수 있습니다.",
        },
      ],
    },
  },
  "emergency-hotlines": {
    en: {
      title: "Taiwan Emergency Hotline Directory & One-Tap Dialer",
      description:
        "A directory of 47+ official short-code hotlines and emergency numbers nationwide, plus every county/city's own 1999 direct-dial number — one-tap calling for 110, 119, 112, 113, and 118, fuzzy keyword search, a 22-county/city switcher, and offline lookup with no delay.",
      directAnswer:
        "This directory covers 110 (police), 119 (fire/ambulance), 112 (international mobile emergency), 113 (domestic violence / sexual assault protection), 118 (coast guard rescue), 165 (anti-fraud), 1925 (mental health support), 1966 (long-term care), and every one of Taiwan's 22 counties/cities' own 1999 direct-dial landline number — supports one-tap calling from a mobile phone and offline lookup when there's no signal.",
      faqs: [
        {
          question: "What should someone do if their phone has no SIM card or carrier signal?",
          answer:
            "Dial 112 directly. 112 is the globally recognized mobile emergency number — as long as there's a signal from any carrier's tower nearby, the call will connect across networks. Once connected, follow the voice prompts: press 0 to transfer to the police (110), or 9 to transfer to the fire department (119).",
        },
        {
          question: "What's the difference between dialing 1999 from a landline versus a mobile phone?",
          answer:
            "Dialing 1999 from a landline connects precisely to the local county/city government, and most areas offer the first few minutes free. Dialing 1999 from a mobile phone may connect to a neighboring county/city instead, depending on which cell tower is used, and normal call charges apply. When outside the home county/city and needing that specific local government, it's best to dial that county/city's own direct landline number (e.g. Taipei City: 02-2720-8889).",
        },
        {
          question: "How can a Deaf or speech-impaired person report an emergency to 110 or 119?",
          answer:
            "The National Police Agency and the National Fire Agency both run dedicated SMS reporting lines: text 0911-511-110 for a police report, or 0911-511-119 for a fire/medical emergency. The 119 reporting app's location-and-tap reporting feature can also be used.",
        },
        {
          question: "What's the difference between the 1925, 1980, and 1995 mental-health support lines?",
          answer:
            "1925 is the Ministry of Health and Welfare's 24-hour free hotline focused on emotional distress and suicide-crisis intervention. 1980 is the China Youth Corps's \"Teacher Chang\" line, focused on counseling young people on growth, schoolwork, family, and relationship issues. 1995 is the Lifeline support hotline, offering 24-hour listening support through low periods in life and family or emotional difficulties.",
        },
      ],
    },
    ja: {
      title: "台湾全国緊急ホットライン一覧・ワンタップ発信",
      description:
        "全国47種類以上の公式特殊番号・救急ホットラインと、各県市独自の1999専用ダイヤルをまとめて収録。110・119・112・113・118へのワンタップ発信、あいまいキーワード検索、22県市切り替え、オフラインでも即座に検索可能。",
      directAnswer:
        "本一覧は110（警察通報）、119（消防・救急）、112（国際共通携帯緊急番号）、113（DV・性暴力保護）、118（海難救助）、165（詐欺被害通報）、1925（こころの健康相談）、1966（介護）、そして台湾全22県市それぞれの1999専用市内番号を収録。携帯電話からのワンタップ発信とオフライン検索に対応しています。",
      faqs: [
        {
          question: "携帯電話にSIMカードが無い、または契約キャリアの電波が無い場合はどうすればいいですか？",
          answer:
            "直接112番へ発信してください。112は世界共通の携帯緊急番号で、周辺にいずれかのキャリアの基地局電波があれば、契約外の回線でも接続できます。接続後は音声案内に従い、0を押すと警察（110）、9を押すと消防（119）へ転送されます。",
        },
        {
          question: "固定電話と携帯電話で1999にかける場合、何が違いますか？",
          answer:
            "固定電話から1999にかけると発信地の県市政府に正確に接続され、多くの県市で最初の数分間が無料です。携帯電話からかけると接続している基地局の関係で近隣の県市に誤って転送されることがあり、通話料金も個人の契約プランに応じて発生します。他の県市にいて特定の県市窓口に相談したい場合は、その県市専用の市内番号（例：台北市 02-2720-8889）に直接かけることをお勧めします。",
        },
        {
          question: "聴覚・言語障がいのある方が110や119に通報する方法は？",
          answer:
            "警察庁と消防庁には聴覚・言語障がい者専用のSMS通報窓口があります。警察への通報は0911-511-110へ、消防・救急への通報は0911-511-119へショートメールを送信してください。119通報アプリの位置情報・タップ通報機能も利用できます。",
        },
        {
          question: "1925・1980・1995のこころの相談窓口はどう違いますか？",
          answer:
            "1925は衛生福利部（厚生福祉省）が運営する24時間無料のこころの健康ホットラインで、情緒的な苦痛や自殺の危機対応に特化しています。1980は中国青年救国団の「張老師」相談専線で、青少年の成長・学業・親子関係・対人関係の相談を専門としています。1995はいのちの電話（生命線）相談専線で、24時間人生の低迷期や家庭・感情の悩みに寄り添う傾聴支援を提供しています。",
        },
      ],
    },
    ko: {
      title: "대만 전국 긴급 전화 안내 및 원터치 다이얼",
      description:
        "전국 47개 이상의 공식 특수 서비스 번호와 긴급 구조 전화, 각 현·시별 1999 직통 대표번호를 한곳에 모았습니다. 110·119·112·113·118 원터치 발신, 키워드 유사 검색, 22개 현·시 전환, 오프라인에서도 지연 없는 조회를 지원합니다.",
      directAnswer:
        "이 목록은 110(경찰 신고), 119(소방·구급), 112(국제 공통 휴대폰 긴급 번호), 113(가정폭력·성폭력 보호), 118(해상 구조), 165(사기 신고), 1925(마음 건강 상담), 1966(장기요양), 그리고 대만 전국 22개 현·시 각각의 1999 직통 유선 전화번호를 모았습니다. 휴대폰 원터치 발신과 오프라인 조회를 지원합니다.",
      faqs: [
        {
          question: "휴대폰에 SIM 카드가 없거나 통신사 신호가 없을 때는 어떻게 해야 하나요?",
          answer:
            "112로 바로 전화하세요. 112는 전 세계 공통 휴대폰 긴급 번호로, 주변에 어느 통신사든 기지국 신호가 있으면 다른 통신망이라도 연결됩니다. 연결 후 음성 안내에 따라 0번을 누르면 경찰(110)로, 9번을 누르면 소방(119)으로 연결됩니다.",
        },
        {
          question: "유선전화와 휴대폰으로 1999에 전화할 때 차이가 있나요?",
          answer:
            "유선전화로 1999에 걸면 발신 지역의 현·시 정부로 정확히 연결되며, 대부분의 지역에서 처음 몇 분은 무료입니다. 휴대폰으로 걸면 접속된 기지국에 따라 인근 현·시로 잘못 연결될 수 있고, 통화료는 개인 요금제에 따라 부과됩니다. 다른 지역에 있으면서 특정 현·시 민원을 문의하려면 해당 현·시의 유선 대표번호(예: 타이베이시 02-2720-8889)로 직접 전화하는 것이 좋습니다.",
        },
        {
          question: "청각·언어 장애가 있는 경우 110이나 119에 어떻게 신고하나요?",
          answer:
            "경찰청과 소방청은 청각·언어 장애인을 위한 전용 문자 신고 서비스를 운영합니다. 경찰 신고는 0911-511-110으로, 소방·구급 신고는 0911-511-119로 문자를 보내면 됩니다. 119 신고 앱의 위치 기반·터치 신고 기능도 이용할 수 있습니다.",
        },
        {
          question: "1925, 1980, 1995 심리 상담 전화는 어떻게 다른가요?",
          answer:
            "1925는 보건복지부가 운영하는 24시간 무료 마음 건강 상담 전화로, 정서적 고통과 자살 위기 개입에 중점을 둡니다. 1980은 구국단에서 운영하는 '장 선생님' 상담 전화로, 청소년의 성장, 학업, 가족, 인간관계 상담을 전문으로 합니다. 1995는 생명의 전화 상담 서비스로, 24시간 인생의 어려운 시기나 가족·감정 문제에 귀 기울여주는 경청 지원을 제공합니다.",
        },
      ],
    },
  },
};

/** Resolves the zh-TW baseline straight from TOOL_CATALOG — never stored
 * twice. Throws if `slug` has no catalog entry, since that's a programming
 * error (every TRANSLATED_TOOL_SLUGS entry must have one). */
function getZhToolMeta(slug: string): LocalizedToolMeta {
  const entry = TOOL_CATALOG.find((tool) => tool.slug === slug);
  if (!entry) {
    throw new Error(`getZhToolMeta: no TOOL_CATALOG entry for slug "${slug}"`);
  }
  return {
    title: entry.title,
    description: entry.description,
    directAnswer: entry.directAnswer,
    faqs: entry.faqs,
  };
}

/**
 * Returns the title/description/directAnswer/faqs for `slug` in `locale`.
 * zh-TW (or any slug without a translation registered) always resolves to
 * the TOOL_CATALOG baseline — this function never silently falls back to
 * Chinese for a locale it claims to support, by construction (TypeScript
 * requires every TranslatedToolSlug to have all 3 PathLocale entries above).
 */
export function getLocalizedToolMeta(
  slug: TranslatedToolSlug,
  locale: PathLocale | "zh-TW",
): LocalizedToolMeta {
  if (locale === "zh-TW") return getZhToolMeta(slug);
  return TOOL_I18N_CONTENT[slug][locale];
}

export { TOOL_I18N_CONTENT };
