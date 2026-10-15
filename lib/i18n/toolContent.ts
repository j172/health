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

  // Issue #486 (parent #438 §Q) — 11 medical/transport/weather/disaster
  // pages added to the i18n batch. Same scope rule as the pilot 3: title,
  // description, directAnswer and FAQs are real human-reviewable
  // translations; government data embedded in each page's body (facility
  // names, addresses, station names, agency names) stays in Chinese
  // verbatim and only gets an added language-appropriate label — see each
  // tool's *Content.tsx for where that happens.
  clinics: {
    en: {
      title: "Taiwan NHI-Contracted Medical Facility Directory",
      description:
        "Search Taiwan's National Health Insurance (NHI) contracted medical facilities, with keyword search and nearby-location lookup.",
      directAnswer:
        "Real-time lookup of nearly 20,000 NHI-contracted medical facilities nationwide (medical centers, regional hospitals, district hospitals, and primary-care clinics), with keyword, specialty, county/city, and GPS-distance search.",
      faqs: [
        {
          question: "Which tiers of medical facility can I search here?",
          answer:
            "Currently covers NHI-contracted medical centers, regional hospitals, district hospitals, and primary-care clinics.",
        },
        {
          question: "How often is the data updated?",
          answer:
            "The data comes from Taiwan's National Health Insurance Administration's open data and is synced on a regular schedule.",
        },
      ],
    },
    ja: {
      title: "台湾健保特約医療機関検索",
      description:
        "台湾の全民健康保険（NHI）特約医療機関を検索。キーワード検索と近隣検索に対応。",
      directAnswer:
        "全国約2万件の健保特約医療機関（医学センター、地域医院、地区医院、基層診療所）をリアルタイムで検索。キーワード、診療科、県市、GPS距離での絞り込みに対応しています。",
      faqs: [
        {
          question: "どの階層の医療機関を検索できますか？",
          answer:
            "現在、健保特約の医学センター、地域医院、地区医院、基層診療所を収録しています。",
        },
        {
          question: "データはどのくらいの頻度で更新されますか？",
          answer: "データは衛生福利部中央健康保険署の公開データを定期的に同期しています。",
        },
      ],
    },
    ko: {
      title: "대만 건강보험 계약 의료기관 검색",
      description: "대만 전 국민 건강보험(NHI) 계약 의료기관을 검색합니다. 키워드 검색과 주변 위치 검색을 지원합니다.",
      directAnswer:
        "전국 약 2만 개 건강보험 계약 의료기관(의학센터, 지역병원, 지구병원, 1차 진료 의원)을 실시간으로 검색합니다. 키워드, 진료과, 현·시, GPS 거리 기반 검색을 지원합니다.",
      faqs: [
        {
          question: "어떤 등급의 의료기관을 검색할 수 있나요?",
          answer: "현재 건강보험 계약 의학센터, 지역병원, 지구병원, 1차 진료 의원을 수록하고 있습니다.",
        },
        {
          question: "데이터는 얼마나 자주 업데이트되나요?",
          answer: "데이터는 보건복지부 건강보험공단의 공개 데이터를 기반으로 정기적으로 동기화됩니다.",
        },
      ],
    },
  },
  pharmacies: {
    en: {
      title: "Taiwan Pharmacy Directory",
      description:
        "Search ordinary and NHI-contracted pharmacies nationwide, with keyword search and nearby-location lookup.",
      directAnswer:
        "Search 8,000+ ordinary and NHI-contracted pharmacies nationwide, with filtering for pharmacies that dispense chronic-disease repeat prescriptions and nearby GPS lookup.",
      faqs: [
        {
          question: "What's the difference between an ordinary pharmacy and an NHI-contracted pharmacy?",
          answer:
            "An NHI-contracted pharmacy can accept NHI prescriptions and provide NHI-reimbursed dispensing services; an ordinary pharmacy may not hold that contract and can generally only sell over-the-counter medicine. This tool includes and labels both.",
        },
      ],
    },
    ja: {
      title: "台湾薬局検索",
      description: "全国の一般薬局および健保特約薬局を検索。キーワード検索と近隣検索に対応。",
      directAnswer:
        "全国8,000件以上の一般薬局・健保特約薬局を検索。慢性疾患の連続処方箋に対応する調剤薬局の絞り込みとGPS近隣検索に対応しています。",
      faqs: [
        {
          question: "一般薬局と健保特約薬局の違いは何ですか？",
          answer:
            "健保特約薬局は健保処方箋を受け付け、健保給付の調剤サービスを提供できます。一般薬局は特約資格を持たない場合があり、市販薬の販売などに限られます。本ツールは両方を収録し、区別して表示しています。",
        },
      ],
    },
    ko: {
      title: "대만 약국 검색",
      description: "전국 일반 약국 및 건강보험 계약 약국을 검색합니다. 키워드 검색과 주변 위치 검색을 지원합니다.",
      directAnswer:
        "전국 8,000개 이상의 일반 약국 및 건강보험 계약 약국을 검색합니다. 만성질환 반복 처방전 조제 약국 필터링과 GPS 주변 검색을 지원합니다.",
      faqs: [
        {
          question: "일반 약국과 건강보험 계약 약국은 어떻게 다른가요?",
          answer:
            "건강보험 계약 약국은 건강보험 처방전을 접수하고 건강보험 급여 조제 서비스를 제공할 수 있습니다. 일반 약국은 계약 자격이 없을 수 있으며 일반의약품 판매 등에 한정됩니다. 이 도구는 두 가지 모두 수록하고 구분하여 표시합니다.",
        },
      ],
    },
  },
  "public-toilets": {
    en: {
      title: "Taiwan Public Restroom Directory",
      description:
        "Search public restroom locations nationwide, with accessible and family-friendly facility filters. Source: Ministry of Environment.",
      directAnswer:
        "Search public restrooms registered with Taiwan's Ministry of Environment, filterable by accessible restroom, family restroom, gender-neutral restroom, and diaper-changing table availability, with cleanliness rating and location shown.",
      faqs: [
        {
          question: "What types of restroom data are included here?",
          answer:
            "Covers men's, women's, unisex, accessible, gender-neutral, and family restrooms, each flagged for whether a diaper-changing table is available. Different restrooms at the same venue are listed separately, since accessible and family-friendly facilities can differ between them.",
        },
        {
          question: "Who rates the cleanliness level?",
          answer:
            "Rated by the Ministry of Environment under its public-restroom management plan, into \"Superior\" and \"Excellent\" tiers; data syncs along with the Ministry's open data.",
        },
      ],
    },
    ja: {
      title: "台湾公衆トイレ検索",
      description:
        "全国の公衆トイレの位置を検索。バリアフリー・親子設備での絞り込みに対応。資料提供：環境部。",
      directAnswer:
        "環境部が管理する全国の公衆トイレを検索。バリアフリートイレ、親子トイレ、ジェンダーフリートイレ、おむつ交換台の有無で絞り込み可能。清潔度評価と位置情報も表示します。",
      faqs: [
        {
          question: "どのような種類のトイレ情報が含まれていますか？",
          answer:
            "男性用、女性用、共用、バリアフリー、ジェンダーフリー、親子トイレを収録し、おむつ交換台の有無も表示します。同一施設内でも設備が異なる場合は、トイレごとに個別に掲載しています。",
        },
        {
          question: "清潔度評価は誰が判定していますか？",
          answer:
            "環境部が公衆トイレ管理維持計画に基づき「特優」「優等」の等級で評定しており、環境部の公開データと同期して更新されます。",
        },
      ],
    },
    ko: {
      title: "대만 공중화장실 검색",
      description: "전국 공중화장실 위치를 검색합니다. 장애인 및 가족 편의시설 필터링을 지원합니다. 자료 제공: 환경부.",
      directAnswer:
        "환경부가 관리하는 전국 공중화장실을 검색합니다. 장애인화장실, 가족화장실, 성중립화장실, 기저귀 교환대 설치 여부로 필터링할 수 있으며, 청결 등급과 위치를 함께 표시합니다.",
      faqs: [
        {
          question: "어떤 종류의 화장실 정보가 포함되어 있나요?",
          answer:
            "남성용, 여성용, 혼합, 장애인용, 성중립, 가족화장실을 포함하며 기저귀 교환대 설치 여부도 표시합니다. 같은 장소라도 시설이 다르면 화장실별로 따로 표시합니다.",
        },
        {
          question: "청결 등급은 누가 평가하나요?",
          answer:
            "환경부가 공중화장실 관리유지계획에 따라 '특우수', '우수' 등급으로 평가하며, 환경부 공개 데이터와 함께 갱신됩니다.",
        },
      ],
    },
  },
  youbike: {
    en: {
      title: "Public Bike-Share (YouBike 2.0) Real-Time Status",
      description:
        "Real-time lookup of YouBike 2.0 and 2.0E rental stations nationwide across 15 counties/cities, with available bikes and open docks.",
      directAnswer:
        "Real-time bike-share status integrates YouBike 2.0 stations across 15 counties/cities nationwide, showing available bikes, open return docks, e-bike counts, and navigation to nearby stations.",
      faqs: [
        {
          question: "Which counties/cities does this cover for YouBike lookup?",
          answer:
            "Currently integrates YouBike 2.0 rental stations with real-time available-bike and open-dock counts across 15 counties/cities: Taipei City, New Taipei City, Taoyuan City, Hsinchu City, Hsinchu County, Miaoli County, Taichung City, Changhua County, Yunlin County, Chiayi City, Chiayi County, Tainan City, Kaohsiung City, Pingtung County, and Taitung County.",
        },
        {
          question: "How do I find the nearest rental station?",
          answer:
            "Once location access is granted, stations are sorted nearest-first by straight-line distance, with available bike counts highlighted in green when supply is good.",
        },
      ],
    },
    ja: {
      title: "公共自転車（YouBike 2.0）リアルタイム状況",
      description:
        "全国15県市のYouBike 2.0・2.0Eレンタルステーションの貸出可能台数と空きドック数をリアルタイムで検索。",
      directAnswer:
        "公共自転車リアルタイム状況は全国15県市のYouBike 2.0ステーションを統合し、貸出可能台数、返却可能な空きドック数、電動アシスト車台数、最寄りステーションへのナビを提供します。",
      faqs: [
        {
          question: "YouBikeの検索対応エリアはどこですか？",
          answer:
            "現在、台北市、新北市、桃園市、新竹市、新竹県、苗栗県、台中市、彰化県、雲林県、嘉義市、嘉義県、台南市、高雄市、屏東県、台東県の15県市のYouBike 2.0ステーションの貸出可能台数・空きドック数をリアルタイムで統合しています。",
        },
        {
          question: "最寄りのレンタルステーションはどうやって探せますか？",
          answer:
            "位置情報の利用を許可すると、直線距離が近い順にステーションが並び替わり、貸出可能台数が十分な場合は緑色で表示されます。",
        },
      ],
    },
    ko: {
      title: "공공자전거(YouBike 2.0) 실시간 현황",
      description: "전국 15개 현·시의 YouBike 2.0 및 2.0E 대여소 대여 가능 자전거 수와 반납 가능 거치대 수를 실시간으로 조회합니다.",
      directAnswer:
        "공공자전거 실시간 현황은 전국 15개 현·시의 YouBike 2.0 대여소를 통합하여 실시간 대여 가능 자전거 수, 반납 가능 거치대 수, 전기자전거 수량, 인근 대여소 길찾기를 제공합니다.",
      faqs: [
        {
          question: "YouBike 조회는 어느 현·시를 지원하나요?",
          answer:
            "현재 타이베이시, 신베이시, 타오위안시, 신주시, 신주현, 먀오리현, 타이중시, 창화현, 윈린현, 자이시, 자이현, 타이난시, 가오슝시, 핑둥현, 타이둥현 등 15개 현·시의 YouBike 2.0 대여소 실시간 대여 가능 수량 및 거치대 공석 수를 통합 제공합니다.",
        },
        {
          question: "가장 가까운 대여소는 어떻게 찾나요?",
          answer: "위치 정보 사용을 허용하면 직선거리가 가까운 순으로 대여소가 정렬되며, 대여 가능 자전거 수가 충분하면 초록색으로 표시됩니다.",
        },
      ],
    },
  },
  "metro-alerts": {
    en: {
      title: "Nationwide Rail Service Disruption Board",
      description:
        "Real-time aggregation of service-disruption notices from Taiwan's 6 metro/light-rail systems (Taipei Metro, Maokong Gondola, Taoyuan Metro, Taichung Metro, Kaohsiung MRT, Kaohsiung Light Rail), Taiwan Railway, and Taiwan High Speed Rail, plus Taipei Metro's station-by-station accessible-elevator maintenance notices. Source: Ministry of Transportation's TDX data-exchange service, Taipei Rapid Transit Corporation.",
      directAnswer:
        "This board aggregates real-time service disruptions, suspensions, and elevator-maintenance notices from Taiwan's 6 metro/light-rail systems, Taiwan Railway, and Taiwan High Speed Rail — if one system's data is temporarily unavailable, the rest still display normally.",
      faqs: [
        {
          question: "Which rail systems does this tool cover?",
          answer:
            "Covers 6 metro/light-rail systems nationwide (Taipei Metro, Maokong Gondola, Taoyuan Metro, Taichung Metro, Kaohsiung MRT, Kaohsiung Light Rail), Taiwan Railway, and Taiwan High Speed Rail — 8 sources of real-time service-disruption notices in total.",
        },
        {
          question: "How often are the notices updated?",
          answer:
            "The system automatically syncs the latest service-disruption and elevator-maintenance schedules published by the Ministry of Transportation's TDX service and Taipei Rapid Transit Corporation every 30 minutes.",
        },
        {
          question: "If one system's data is temporarily unavailable, does it affect the others?",
          answer:
            "No. Each system's data is fetched independently — if one system (e.g. a High Speed Rail request that times out) temporarily fails, only that system shows \"no data available\" for that cycle; the rest continue displaying their latest notices normally.",
        },
        {
          question: "How do I transfer during elevator maintenance?",
          answer:
            "Taipei Metro's elevator-maintenance notices all include an alternate-entrance suggestion or alternate-station guidance for wheelchair users and passengers with reduced mobility.",
        },
      ],
    },
    ja: {
      title: "全国軌道運行障害情報ボード",
      description:
        "全国6つのMRT・LRTシステム（台北MRT、猫空ロープウェイ、桃園MRT、台中MRT、高雄MRT、高雄LRT）、台湾鉄路、台湾新幹線の運行障害公告と、台北MRT各駅のバリアフリーエレベーター点検公告をリアルタイムで集約。資料提供：交通部TDX運輸データ流通サービス、台北大衆捷運公司。",
      directAnswer:
        "本ボードは全国6つのMRT・LRTシステム、台湾鉄路、台湾新幹線の運行異常、運休、エレベーター点検公告をリアルタイムで集約。いずれかのシステムのデータが一時取得できなくても、他のシステムの表示には影響しません。",
      faqs: [
        {
          question: "本ツールはどの軌道システムを対象としていますか？",
          answer:
            "全国6つのMRT・LRTシステム（台北MRT、猫空ロープウェイ、桃園MRT、台中MRT、高雄MRT、高雄LRT）、台湾鉄路、台湾新幹線の計8つのソースのリアルタイム運行障害公告を対象としています。",
        },
        {
          question: "公告情報はどのくらいの頻度で更新されますか？",
          answer:
            "システムは30分ごとに交通部TDXおよび台北大衆捷運公司が発表する最新の運行障害・エレベーター点検スケジュールを自動同期します。",
        },
        {
          question: "あるシステムが一時的にデータを取得できない場合、他のシステムに影響しますか？",
          answer:
            "影響しません。各システムのデータは個別に取得しており、いずれか（例：台湾新幹線のデータがタイムアウトした場合）が一時的に失敗しても、そのシステムのみ「現在データなし」と表示され、他のシステムは最新の公告を通常通り表示します。",
        },
        {
          question: "エレベーター点検中はどうやって乗り換えればいいですか？",
          answer:
            "台北MRTのエレベーター点検公告には、車椅子利用者や移動が不便な乗客向けの代替出入口または代替駅の案内が必ず記載されています。",
        },
      ],
    },
    ko: {
      title: "전국 철도 운행 장애 정보판",
      description:
        "전국 6개 지하철·경전철 시스템(타이베이 MRT, 마오쿵 곤돌라, 타오위안 MRT, 타이중 MRT, 가오슝 MRT, 가오슝 경전철), 대만철도, 대만고속철도의 운행 장애 공지와 타이베이 MRT 각 역의 장애인 엘리베이터 점검 공지를 실시간으로 집계합니다. 자료 제공: 교통부 TDX 교통데이터 유통서비스, 타이베이 대중교통공사.",
      directAnswer:
        "이 정보판은 전국 6개 지하철·경전철 시스템, 대만철도, 대만고속철도의 운행 이상, 운행 중단, 엘리베이터 점검 공지를 실시간으로 집계합니다. 한 시스템의 데이터를 일시적으로 가져올 수 없어도 다른 시스템 표시에는 영향을 주지 않습니다.",
      faqs: [
        {
          question: "이 도구는 어떤 철도 시스템을 다루나요?",
          answer:
            "전국 6개 지하철·경전철 시스템(타이베이 MRT, 마오쿵 곤돌라, 타오위안 MRT, 타이중 MRT, 가오슝 MRT, 가오슝 경전철), 대만철도, 대만고속철도 총 8개 소스의 실시간 운행 장애 공지를 다룹니다.",
        },
        {
          question: "공지 정보는 얼마나 자주 업데이트되나요?",
          answer: "시스템은 30분마다 교통부 TDX와 타이베이 대중교통공사가 발표하는 최신 운행 장애 및 엘리베이터 점검 일정을 자동으로 동기화합니다.",
        },
        {
          question: "한 시스템의 데이터를 일시적으로 조회할 수 없으면 다른 시스템에도 영향이 있나요?",
          answer:
            "영향이 없습니다. 각 시스템의 데이터는 독립적으로 수집되므로, 어느 하나(예: 고속철도 데이터 응답 지연)가 일시적으로 실패해도 해당 시스템만 '현재 데이터 없음'으로 표시되고 나머지 시스템은 정상적으로 최신 공지를 표시합니다.",
        },
        {
          question: "엘리베이터 점검 중에는 어떻게 환승해야 하나요?",
          answer:
            "타이베이 MRT의 엘리베이터 점검 공지에는 휠체어 이용자 및 이동이 불편한 승객을 위한 대체 출입구 안내 또는 대체역 안내가 항상 포함되어 있습니다.",
        },
      ],
    },
  },
  "accessible-transit": {
    en: {
      title: "Nationwide Accessible Transit Map: Low-Floor Buses / Metro Accessibility / Universal Taxis / Rehabus",
      description:
        "Real-time lookup of low-floor bus ratios across 22 counties/cities, accessible-boarding-ramp reservations for Taipei and Kaohsiung Metro plus Taiwan Railway/High Speed Rail, a nationwide universal accessible-taxi dispatch platform, and each county/city's Rehabus (復康巴士) dispatch hotline.",
      directAnswer:
        "This map integrates the Ministry of Transportation's TDX data and each municipality's low-floor bus routes, accessible boarding assistance on Taiwan Railway/High Speed Rail/Metro, and Rehabus plus universal-taxi hotlines across all 22 counties/cities nationwide — helping people with disabilities and older adults travel safely and accessibly.",
      faqs: [
        {
          question: "How do I reserve accessible boarding-ramp assistance on the Metro or Taiwan Railway?",
          answer:
            "On the Metro, call the station service line or ask at the information counter before you arrive; staff will bring a manual ramp to assist boarding/alighting at the platform-to-train gap. On Taiwan Railway, call the customer service line 0800-765888 at least 2 hours before departure to reserve assisted boarding.",
        },
        {
          question: "What should a wheelchair user keep in mind when boarding a low-floor bus?",
          answer:
            "Wave at the bus stop and let the driver know you're boarding with a wheelchair — the driver will lower the bus body and extend the rear ramp. Once aboard, park facing away from the front of the bus in the designated wheelchair area, and fasten the seatbelt and brake.",
        },
        {
          question: "What's the difference between Rehabus (復康巴士) and Long-Term Care transportation (LTC 2.0)?",
          answer:
            "Rehabus mainly serves holders of a disability certificate, is subsidized by the local social affairs bureau, and is billed at roughly one-third of a regular point-to-point taxi fare. LTC transportation instead targets older adults rated at care-level 4 or above, subsidizing point-to-point trips to and from medical appointments and rehabilitation.",
        },
      ],
    },
    ja: {
      title: "全台バリアフリー交通マップ：低床バス／MRTバリアフリー／ユニバーサルタクシー／福祉バス",
      description:
        "全国22県市の低床バス比率、台北・高雄MRTおよび台湾鉄路・新幹線のバリアフリー乗車用渡し板予約、全国対応のユニバーサル配車プラットフォーム、各県市の福祉バス（復康巴士）配車専用電話をリアルタイムで検索。",
      directAnswer:
        "本マップは交通部TDXと各直轄市の低床バス幹線、台湾鉄路・新幹線・MRTのバリアフリー案内設備、そして全国22県市の福祉バスとユニバーサルタクシー専用電話を統合し、障がい者や高齢者の安全でバリアフリーな移動を支援します。",
      faqs: [
        {
          question: "MRTや台湾鉄路のバリアフリー乗車用渡し板サービスはどう予約しますか？",
          answer:
            "MRTでは到着前に駅務電話または案内カウンターで依頼すると、駅員が手動の渡し板を持ってホームと車両の段差での乗降を補助します。台湾鉄路では発車2時間前までにカスタマーサービス（0800-765888）に電話してバリアフリー乗車のお迎えを予約してください。",
        },
        {
          question: "低床バスに車椅子で乗車する際の注意点は？",
          answer:
            "バス停で手を挙げて運転手に車椅子で乗車する旨を伝えると、運転手が車体を下げ後部のスロープ板を引き出します。乗車後は専用の車椅子スペースに車両前方と反対向きに停め、シートベルトとブレーキを固定してください。",
        },
        {
          question: "福祉バス（復康巴士）と長期介護の交通送迎（長照2.0）はどう違いますか？",
          answer:
            "福祉バスは主に身体障害者手帳を持つ方を対象に社会局が補助し、一般タクシーの約3分の1の運賃で利用できます。長期介護の交通送迎は要介護度4以上の高齢者を対象に、医療機関への通院・リハビリの往復を補助するものです。",
        },
      ],
    },
    ko: {
      title: "전국 무장애 교통지도: 저상버스 / 지하철 장애인 편의 / 유니버설 택시 / 재활버스",
      description:
        "전국 22개 현·시의 저상버스 비율, 타이베이·가오슝 지하철 및 대만철도·고속철도의 장애인 승차 램프 예약, 전국 유니버설 장애인 택시 호출 플랫폼, 각 현·시의 재활버스(復康巴士) 배차 전용 전화를 실시간으로 조회합니다.",
      directAnswer:
        "이 지도는 교통부 TDX와 각 직할시의 저상버스 노선, 대만철도·고속철도·지하철의 장애인 안내 편의시설, 그리고 전국 22개 현·시의 재활버스 및 유니버설 택시 전용 전화를 통합하여 장애인과 고령자의 안전하고 편리한 이동을 지원합니다.",
      faqs: [
        {
          question: "지하철이나 대만철도의 장애인 승차 램프 서비스는 어떻게 예약하나요?",
          answer:
            "지하철은 도착 전 역무 전화나 안내 창구에 요청하면 직원이 수동 램프를 가지고 플랫폼과 열차 사이의 승하차를 도와줍니다. 대만철도는 출발 2시간 전까지 고객센터(0800-765888)에 전화하여 장애인 승차 지원을 예약하면 됩니다.",
        },
        {
          question: "저상버스에 휠체어로 탑승할 때 주의할 점은 무엇인가요?",
          answer:
            "정류장에서 손을 들어 기사에게 휠체어로 탑승한다고 알리면 기사가 차체를 낮추고 뒷문 경사판을 내려줍니다. 탑승 후에는 전용 휠체어 공간에 차량 앞쪽을 등지고 정차한 뒤 안전벨트와 브레이크를 고정하세요.",
        },
        {
          question: "재활버스(復康巴士)와 장기요양 교통 지원(장기요양 2.0)은 어떻게 다른가요?",
          answer:
            "재활버스는 주로 장애인 증명서 소지자를 대상으로 사회국이 보조하며, 일반 택시 요금의 약 3분의 1 수준으로 이용할 수 있습니다. 장기요양 교통 지원은 장기요양 등급 4등급 이상의 고령자를 대상으로 의료기관 진료·재활 왕복을 보조합니다.",
        },
      ],
    },
  },
  "weather-alerts": {
    en: {
      title: "Real-Time Weather Alerts & Rainfall Information",
      description:
        "Real-time lookup of weather alerts nationwide (strong wind, dense fog, heavy rain, typhoon warnings, and township-level severe-weather advisories), plus GPS lookup of the nearest station's live and monthly cumulative rainfall.",
      directAnswer:
        "This page connects live to the Central Weather Administration's (CWA) 5 major alert types and station database, providing real-time land strong-wind, dense-fog, heavy-rain, and typhoon-track warnings plus live observations from rainfall stations nationwide.",
      faqs: [
        {
          question: "How often are weather alerts updated?",
          answer:
            "This site's weather-alert data automatically syncs every 5-10 minutes with the Central Weather Administration's latest CAP alerts, typhoon bulletins, and township-level hazard advisories.",
        },
        {
          question: "How do I find the nearest rainfall station to my location?",
          answer:
            "Once browser GPS permission is granted, the system automatically compares against 1,300+ rainfall stations nationwide, calculates the shortest distance, and shows that station's 10-minute, 1-hour, and 24-hour cumulative rainfall; you can also manually pick a county/district instead.",
        },
        {
          question: "What are the grading standards for heavy rain vs. torrential rain?",
          answer:
            "Per CWA standards: Heavy Rain is a 24-hour accumulation of ≥80mm or a 3-hour accumulation of ≥40mm; Extremely Heavy Rain is 24-hour ≥200mm or 3-hour ≥100mm; Torrential Rain is 24-hour ≥350mm or 3-hour ≥200mm; Extremely Torrential Rain is 24-hour ≥500mm.",
        },
      ],
    },
    ja: {
      title: "リアルタイム気象警報・降雨情報",
      description:
        "全国の気象警報（強風、濃霧、豪雨、台風警報、市町村単位の激しい天気特報）をリアルタイムで検索し、GPS位置情報で最寄り測候所のリアルタイム・月間累積降雨量も確認できます。",
      directAnswer:
        "本ページは中央気象署（CWA）の5大警報と測候所データベースにリアルタイムで接続し、陸上強風、濃霧、豪雨、台風進路警報と全国雨量測候所のリアルタイム観測データを提供します。",
      faqs: [
        {
          question: "気象警報はどのくらいの頻度で更新されますか？",
          answer:
            "本サイトの気象警報データは5～10分ごとに中央気象署発表の最新CAP警報、台風情報、市町村災害特報と自動同期しています。",
        },
        {
          question: "自分の位置から最寄りの雨量測候所をどう探せますか？",
          answer:
            "ブラウザのGPS許可後、システムが全国1,300以上の雨量測候所と自動比較し最短距離を算出、該当測候所の10分・1時間・24時間累積降雨量を表示します。手動で県市・行政区を選択することもできます。",
        },
        {
          question: "豪雨と大豪雨の等級基準は何ですか？",
          answer:
            "気象署の基準では、大雨は24時間累積80mm以上または3時間40mm以上、豪雨は24時間200mm以上または3時間100mm以上、大豪雨は24時間350mm以上または3時間200mm以上、超大豪雨は24時間500mm以上です。",
        },
      ],
    },
    ko: {
      title: "실시간 기상 경보 및 강우 정보",
      description:
        "전국 기상 경보(강풍, 짙은 안개, 폭우, 태풍 경보, 읍면동 단위 악천후 특보)를 실시간으로 조회하고, GPS로 가장 가까운 관측소의 실시간 및 월간 누적 강우량을 확인할 수 있습니다.",
      directAnswer:
        "이 페이지는 중앙기상청(CWA)의 5대 경보와 관측소 데이터베이스에 실시간으로 연결되어, 육상 강풍, 짙은 안개, 폭우, 태풍 경로 경보와 전국 강우 관측소의 실시간 관측 데이터를 제공합니다.",
      faqs: [
        {
          question: "기상 경보는 얼마나 자주 업데이트되나요?",
          answer: "본 사이트의 기상 경보 데이터는 5~10분마다 중앙기상청이 발표하는 최신 CAP 경보, 태풍 정보, 읍면동 재해 특보와 자동으로 동기화됩니다.",
        },
        {
          question: "내 위치에서 가장 가까운 강우 관측소는 어떻게 찾나요?",
          answer:
            "브라우저 GPS 권한을 허용하면 시스템이 전국 1,300개 이상의 강우 관측소와 자동으로 비교하여 최단 거리를 계산하고, 해당 관측소의 10분·1시간·24시간 누적 강우량을 표시합니다. 현·행정구를 직접 선택하여 조회할 수도 있습니다.",
        },
        {
          question: "폭우와 대폭우의 등급 기준은 무엇인가요?",
          answer:
            "기상청 기준으로 대우(大雨)는 24시간 누적 80mm 이상 또는 3시간 40mm 이상, 호우(豪雨)는 24시간 200mm 이상 또는 3시간 100mm 이상, 대호우(大豪雨)는 24시간 350mm 이상 또는 3시간 200mm 이상, 초대호우(超大豪雨)는 24시간 500mm 이상입니다.",
        },
      ],
    },
  },
  aqi: {
    en: {
      title: "Taiwan Real-Time Air Quality Index (AQI)",
      description:
        "Real-time display of the Air Quality Index (AQI) from Ministry of Environment monitoring stations nationwide, including PM2.5, PM10, and other pollutant concentrations.",
      directAnswer:
        "Connects live to the Ministry of Environment's nationwide monitoring stations, providing the AQI and PM2.5/PM10 concentrations. Grading: 0-50 Good (green), 51-100 Moderate (yellow), 101-150 Unhealthy for Sensitive Groups (orange), 151-200 Unhealthy (red).",
      faqs: [
        {
          question: "How do I read the AQI value?",
          answer:
            "AQI (Air Quality Index) values of 0-50 are Good, 51-100 Moderate, 101-150 Unhealthy for Sensitive Groups, and 151-200 Unhealthy for All Groups — the higher the number, the more severe the air pollution.",
        },
        {
          question: "Where does the data come from?",
          answer:
            "Data comes from the Ministry of Environment's real-time air-quality observations at monitoring stations nationwide, automatically synced hourly.",
        },
      ],
    },
    ja: {
      title: "台湾リアルタイム大気質指数（AQI）",
      description:
        "全国の環境部監測ステーションによる大気質指数（AQI）をリアルタイムで表示。PM2.5、PM10などの汚染物質濃度を含みます。",
      directAnswer:
        "環境部の全国監測ステームにリアルタイム接続し、AQI指標とPM2.5／PM10濃度を提供。等級：0-50良好（緑）、51-100普通（黄）、101-150敏感者に不健康（オレンジ）、151-200全員に不健康（赤）。",
      faqs: [
        {
          question: "AQI数値はどう読めばいいですか？",
          answer:
            "AQI（大気質指数）は0-50が良好、51-100が普通、101-150が敏感者に不健康、151-200が全員に不健康を示し、数値が高いほど大気汚染が深刻であることを意味します。",
        },
        {
          question: "データの出典はどこですか？",
          answer: "データは環境部による全国各監測ステームのリアルタイム大気質観測データで、毎時自動同期されます。",
        },
      ],
    },
    ko: {
      title: "대만 실시간 대기질 지수(AQI)",
      description: "전국 환경부 측정소의 대기질 지수(AQI)를 실시간으로 표시합니다. PM2.5, PM10 등 오염물질 농도를 포함합니다.",
      directAnswer:
        "환경부의 전국 측정소에 실시간으로 연결하여 AQI 지표와 PM2.5/PM10 농도를 제공합니다. 등급: 0-50 좋음(녹색), 51-100 보통(노란색), 101-150 민감군 영향(주황색), 151-200 전체 영향(빨간색).",
      faqs: [
        {
          question: "AQI 수치는 어떻게 해석하나요?",
          answer:
            "AQI(대기질 지수)는 0-50이 좋음, 51-100이 보통, 101-150이 민감군에게 나쁨, 151-200이 모든 사람에게 나쁨을 나타내며, 수치가 높을수록 대기 오염이 심각하다는 의미입니다.",
        },
        {
          question: "데이터 출처는 어디인가요?",
          answer: "데이터는 환경부의 전국 각 측정소 실시간 대기질 관측 자료로, 매시간 자동으로 동기화됩니다.",
        },
      ],
    },
  },
  uv: {
    en: {
      title: "Taiwan Real-Time UV Index",
      description:
        "Real-time lookup of the UV Index from weather stations in every county/city nationwide, with exposure-protection grading (Low, Moderate, High, Very High, Extreme) and professional sunscreen-SPF and accessory recommendations.",
      directAnswer:
        "The UV Index is an international measure of how intense solar ultraviolet radiation is at ground level. Taiwan's Central Weather Administration grades it into 5 levels: 0-2 Low (green), 3-5 Moderate (yellow), 6-7 High (orange), 8-10 Very High (red), 11+ Extreme (purple).",
      faqs: [
        {
          question: "What are the UV Index grading standards?",
          answer:
            "Per Central Weather Administration and Ministry of Environment standards: 0-2 is Low (green), 3-5 Moderate (yellow), 6-7 High (orange), 8-10 Very High (red), and 11+ Extreme (purple).",
        },
        {
          question: "How should I protect myself at Very High or Extreme levels?",
          answer:
            "When the UV Index reaches Very High (8-10) or Extreme (11+), sunburn can occur in as little as 15-20 minutes — avoid prolonged sun exposure between 10am and 2pm, and when outdoors, always wear SPF30+ sunscreen, a hat, and sunglasses.",
        },
        {
          question: "Where does the data come from and how often is it updated?",
          answer:
            "This site's UV data syncs from the Central Weather Administration's real-time ground-based weather-station observations nationwide, automatically cross-checked and updated hourly.",
        },
      ],
    },
    ja: {
      title: "台湾リアルタイム紫外線指数（UV）",
      description:
        "全国各県市の気象ステームの紫外線指数（UV Index）をリアルタイムで検索。紫外線曝露防護等級（低、中、高、過量、極めて高い）と専門的な日焼け止め指数・アクセサリーの提案を提供。",
      directAnswer:
        "紫外線指数（UV Index）は太陽紫外線が地表に到達する放射強度を測る国際指標です。中央気象署は数値を5段階に分類：0-2 低（緑）、3-5 中（黄）、6-7 高（オレンジ）、8-10 過量（赤）、11以上 極めて高い（紫）。",
      faqs: [
        {
          question: "紫外線指数の等級基準は何ですか？",
          answer:
            "中央気象署と環境部の基準では：0-2が低（緑）、3-5が中（黄）、6-7が高（オレンジ）、8-10が過量（赤）、11以上が極めて高い（紫）です。",
        },
        {
          question: "過量・極めて高いレベルの時はどう防護すればいいですか？",
          answer:
            "紫外線が過量級（8-10）または極めて高いレベル（11以上）に達すると、わずか15～20分で日焼けする可能性があります。午前10時から午後2時の間は長時間の日光曝露を避け、外出時はSPF30以上の日焼け止め、帽子、サングラスを必ず着用してください。",
        },
        {
          question: "データの出典と更新頻度は？",
          answer:
            "本サイトの紫外線データは中央気象署の全国地上気象観測ステームのリアルタイム観測データと同期し、毎時自動で照合・更新されます。",
        },
      ],
    },
    ko: {
      title: "대만 실시간 자외선 지수(UV)",
      description:
        "전국 각 현·시 기상관측소의 자외선 지수(UV Index)를 실시간으로 조회합니다. 자외선 노출 보호 등급(낮음, 보통, 높음, 매우 높음, 위험)과 전문 자외선 차단 지수·보호용품 추천을 제공합니다.",
      directAnswer:
        "자외선 지수(UV Index)는 태양 자외선이 지표에 도달하는 방사 강도를 측정하는 국제 지표입니다. 중앙기상청은 수치를 5단계로 분류합니다: 0-2 낮음(녹색), 3-5 보통(노란색), 6-7 높음(주황색), 8-10 매우 높음(빨간색), 11 이상 위험(보라색).",
      faqs: [
        {
          question: "자외선 지수 등급 기준은 무엇인가요?",
          answer: "중앙기상청과 환경부 기준에 따르면 0-2는 낮음(녹색), 3-5는 보통(노란색), 6-7은 높음(주황색), 8-10은 매우 높음(빨간색), 11 이상은 위험(보라색)입니다.",
        },
        {
          question: "매우 높음·위험 등급일 때는 어떻게 대비해야 하나요?",
          answer:
            "자외선이 매우 높음(8-10) 또는 위험(11 이상) 등급에 도달하면 단 15~20분 만에 화상을 입을 수 있습니다. 오전 10시부터 오후 2시 사이에는 장시간 햇볕 노출을 피하고, 외출 시에는 SPF30+ 자외선 차단제, 모자, 선글라스를 반드시 착용하세요.",
        },
        {
          question: "데이터 출처와 업데이트 주기는 어떻게 되나요?",
          answer: "본 사이트의 자외선 데이터는 중앙기상청의 전국 지상 기상관측소 실시간 관측 데이터와 동기화되며, 매시간 자동으로 대조·갱신됩니다.",
        },
      ],
    },
  },
  "disaster-map": {
    en: {
      title: "Disaster Map: Shelters / Fire-Rescue Units / Emergency Operations Centers",
      description:
        "Combines Ministry of the Interior open data to map shelters, fire-rescue units, and county/city emergency operations centers nationwide, with map-layer switching and detailed location lookup.",
      directAnswer:
        "This disaster map combines Ministry of the Interior open-data-platform locations for shelters (5,900+), fire-rescue units (770+), and county/city emergency operations centers (25), with map-layer switching; this page's data is not real-time — for actual opening status, always follow the local government's official announcement.",
      faqs: [
        {
          question: "How often is the disaster-map data updated?",
          answer:
            "This site syncs daily with the Ministry of the Interior's open-data platform for shelter, fire-rescue-unit, and emergency-operations-center locations; the most recent sync time is shown at the top of the page.",
        },
        {
          question: "Are shelters already open when an earthquake or typhoon hits?",
          answer:
            "Not necessarily. The data on this page is a standing roster of shelters that are normally available, not their real-time open status — for whether a specific shelter is actually open, its hours, and capacity, always follow the local government's (fire department or district office's) official announcement rather than acting on this page's information alone.",
        },
        {
          question: "What do the three layers (shelters / fire-rescue units / emergency operations centers) mean?",
          answer:
            "Shelters are places the public can go to for refuge when a disaster occurs. Fire-rescue units are fire-station locations, useful for finding the nearest fire station. Emergency operations centers are each county/city government's disaster-response command center, usually co-located with the fire department, responsible for coordinating disaster relief.",
        },
      ],
    },
    ja: {
      title: "防災マップ：避難収容所／消防救援ユニット／対応センター",
      description:
        "内政部の公開データを統合し、全国の避難収容所、消防救援ユニット、県市対応センターの位置を地図上で検索。レイヤー切り替えと詳細な位置情報検索に対応。",
      directAnswer:
        "本防災マップは内政部オープンデータプラットフォームの避難収容所（5,900箇所以上）、消防救援ユニット（770箇所以上）、県市対応センター（25箇所）の位置を統合し、地図レイヤーの切り替え検索を提供します。本ページのデータはリアルタイムではないため、実際の開設状況は地方自治体の正式発表に従ってください。",
      faqs: [
        {
          question: "防災マップのデータはどのくらいの頻度で更新されますか？",
          answer:
            "本サイトは毎日、内政部オープンデータプラットフォームの避難収容所、消防救援ユニット、対応センターの位置データを同期しており、ページ上部に最新の同期時刻が表示されます。",
        },
        {
          question: "地震や台風が来たとき、避難収容所はすでに開設されていますか？",
          answer:
            "必ずしもそうではありません。本ページのデータは平時に利用可能な避難収容所の名簿であり、リアルタイムの開設状況ではありません。実際の開設有無、開放時間、収容状況については、地方自治体（消防局／区役所）の正式発表に従い、本ページの情報だけで判断して向かわないでください。",
        },
        {
          question: "3つのレイヤー（避難収容所／消防救援ユニット／対応センター）はそれぞれ何を表しますか？",
          answer:
            "避難収容所は災害発生時に住民が避難できる場所です。消防救援ユニットは消防署の位置で、最寄りの消防機関を検索するのに役立ちます。対応センターは各県市政府の災害対応指揮センターで、通常は消防局と同じ場所にあり、救援活動の統括指揮を担います。",
        },
      ],
    },
    ko: {
      title: "재난 지도: 대피시설 / 소방구조단위 / 재난대응센터",
      description:
        "내정부 공개 데이터를 통합하여 전국 대피시설, 소방구조단위, 현·시 재난대응센터 위치를 지도에서 조회합니다. 레이어 전환과 상세 위치 조회를 지원합니다.",
      directAnswer:
        "이 재난 지도는 내정부 공개 데이터 플랫폼의 대피시설(5,900개 이상), 소방구조단위(770개 이상), 현·시 재난대응센터(25개) 위치를 통합하여 지도 레이어 전환 조회를 제공합니다. 이 페이지의 데이터는 실시간이 아니므로 실제 개방 상태는 지방정부의 공식 발표를 따르십시오.",
      faqs: [
        {
          question: "재난 지도 데이터는 얼마나 자주 업데이트되나요?",
          answer:
            "본 사이트는 매일 내정부 공개 데이터 플랫폼의 대피시설, 소방구조단위, 재난대응센터 위치 데이터를 동기화하며, 페이지 상단에 가장 최근 동기화 시각이 표시됩니다.",
        },
        {
          question: "지진이나 태풍이 닥치면 대피시설이 이미 개방되어 있나요?",
          answer:
            "반드시 그렇지는 않습니다. 이 페이지의 데이터는 평시에 이용 가능한 대피시설 명부이며 실시간 개방 상태가 아닙니다. 실제 개방 여부, 운영 시간, 수용 현황은 지방정부(소방서 또는 구청)의 공식 발표를 따르고, 이 페이지 정보만으로 임의로 이동하지 마십시오.",
        },
        {
          question: "세 가지 레이어(대피시설 / 소방구조단위 / 재난대응센터)는 각각 무엇을 의미하나요?",
          answer:
            "대피시설은 재난 발생 시 주민이 피신할 수 있는 장소입니다. 소방구조단위는 소방서 위치로, 인근 소방 기관을 조회하는 데 유용합니다. 재난대응센터는 각 현·시 정부의 재난 대응 지휘 센터로, 보통 소방서와 같은 위치에 있으며 구호 활동의 총괄 지휘를 담당합니다.",
        },
      ],
    },
  },

  // Issue #487 (parent #438 §Q) — 4 leisure/culture pages added to the
  // i18n batch. Same scope rule: title, description, directAnswer and FAQs
  // are real human-reviewable translations; government/live data stays
  // Chinese verbatim per the established convention.
  "cool-spots": {
    en: {
      title: "Nationwide Cool Spots Map (Heatwave Relief Locations)",
      description:
        "Looks up the Ministry of Environment's \"Cool Map\" cool-spot registry — department stores, libraries, neighborhood activity centers, and other indoor locations the public can use to cool down, with each site's location and facility information. Source: Ministry of Environment open data.",
      directAnswer:
        "This tool searches the Ministry of Environment's \"Cool Map\" cool-spot registry, showing nearby indoor locations to escape summer heat, along with opening hours and facility information such as air conditioning and drinking water.",
      faqs: [
        {
          question: "What is a \"cool spot\"?",
          answer:
            "A cool spot is an indoor location — a department store, library, or neighborhood activity center, for example — that the Ministry of Environment has catalogued during heatwaves because it offers air conditioning, seating, or drinking water, giving the public a nearby place to cool down and rest during extreme heat.",
        },
        {
          question: "How do I know whether a cool spot has air conditioning or accessible facilities?",
          answer:
            "Each listing's \"Facility information\" field states whether that location offers air conditioning, restrooms, seating, drinking water, and accessible facilities, so users can choose a location that fits their needs.",
        },
      ],
    },
    ja: {
      title: "全国涼適点（クールスポット）マップ",
      description:
        "環境部「Cool Map 涼適点」名簿を検索。百貨店、図書館、地域活動センターなど、暑さを避けて涼める屋内施設の位置と設備情報を提供します。データ提供：環境部オープンデータ。",
      directAnswer:
        "環境部の「Cool Map」涼適点名簿を検索し、夏の猛暑時に立ち寄れる屋内施設の位置、開放時間、冷房・給水設備などの情報を提供します。",
      faqs: [
        {
          question: "「涼適点」とは何ですか？",
          answer:
            "涼適点とは、環境部が猛暑対策として指定した、冷房・座席・給水設備のある百貨店、図書館、地域活動センターなどの屋内施設で、猛暑時に立ち寄って涼める場所です。",
        },
        {
          question: "涼適点に冷房や無障礙（バリアフリー）設備があるかはどうすればわかりますか？",
          answer:
            "各データの「設備情報」欄に、冷房・トイレ・座席・給水設備・バリアフリー設備の有無が表示されるため、ニーズに合った場所を選べます。",
        },
      ],
    },
    ko: {
      title: "전국 쾌적 쉼터(Cool Spot) 지도",
      description:
        "환경부 'Cool Map 쾌적 쉼터' 명단을 조회합니다. 백화점, 도서관, 주민센터 등 더위를 피해 쉴 수 있는 실내 장소의 위치와 시설 정보를 제공합니다. 자료 제공: 환경부 공공데이터.",
      directAnswer:
        "환경부의 'Cool Map' 쾌적 쉼터 명단을 조회하여, 한여름 폭염 시 가까운 실내 장소의 위치와 운영 시간, 냉방·음수대 등 시설 정보를 확인할 수 있습니다.",
      faqs: [
        {
          question: "'쾌적 쉼터'란 무엇인가요?",
          answer:
            "쾌적 쉼터는 환경부가 폭염에 대응하기 위해 지정한, 냉방·좌석·음수 시설이 있는 백화점, 도서관, 주민센터 등의 실내 장소로, 폭염 시 가까운 곳에서 더위를 피해 쉴 수 있는 장소입니다.",
        },
        {
          question: "쾌적 쉼터에 냉방이나 무장애(접근성) 시설이 있는지 어떻게 알 수 있나요?",
          answer:
            "각 항목의 '시설 정보'란에 냉방, 화장실, 좌석, 음수대, 무장애 시설 제공 여부가 표시되어 있어 필요에 맞는 장소를 선택할 수 있습니다.",
        },
      ],
    },
  },
  "cultural-events": {
    en: {
      title: "Nationwide Arts & Culture Events Directory (incl. Family-Friendly Activities)",
      description:
        "Aggregates the Ministry of Culture's nationwide arts-and-culture open data to search exhibitions, music, theater, talks, and other events across the country, with a \"Family-Friendly\" filter tag for quickly finding family theater, children's concerts, and family workshops. Source: Ministry of Culture open data.",
      directAnswer:
        "This tool connects live to the Ministry of Culture's arts-and-culture events system to search exhibitions, concerts, and talks nationwide, with a \"Family-Friendly\" filter tag that narrows results to family theater, children's concerts, and workshop programs only.",
      faqs: [
        {
          question: "What categories of events does this cover?",
          answer:
            "It fully covers the Ministry of Culture's 19 arts-and-culture categories (exhibitions, music, theater, dance, family activities, talks, film, independent music, variety shows, arts competitions, concerts, workshops, and more), nationwide festivals, and cultural-district venues.",
        },
        {
          question: "Does this page include the content of the former \"Nationwide Family Arts Activities\" tool?",
          answer:
            "Yes. The former \"Nationwide Family Arts Activities\" page has been merged into this one and now permanently redirects here — clicking the \"👨‍👩‍👧 Family-Friendly\" filter tag shows only family theater, children's concerts, and family workshop programs, matching the scope of the original page exactly.",
        },
      ],
    },
    ja: {
      title: "全国芸術文化イベント・親子活動検索（親子向けイベント含む）",
      description:
        "文化部の全国芸術文化活動オープンデータを統合し、全国の展覧会、音楽、演劇、講座など各種イベントを検索。「親子向け」フィルタータグで親子劇場、子ども向けコンサート、親子ワークショップをすぐに絞り込めます。データ提供：文化部オープンデータ。",
      directAnswer:
        "文化部の芸術文化イベント情報システムにリアルタイムで接続し、全国の公演、コンサート、講座イベントを検索。「親子向け」フィルタータグに切り替えると、親子劇場、子ども向けコンサート、ワークショップ番組だけを表示できます。",
      faqs: [
        {
          question: "イベント情報にはどのようなカテゴリーが含まれますか？",
          answer:
            "文化部の19種類の芸術文化活動（展覧会、音楽、演劇、舞踊、親子、講座、映画、インディーミュージック、バラエティ、芸術コンクール、コンサート、研修講座など）、全国の祭り行事、文化生活圏の施設を完全に網羅しています。",
        },
        {
          question: "このページには以前の「全国親子藝文活動検索」の内容も含まれますか？",
          answer:
            "はい。以前の「全国親子藝文活動検索」ページはこのページに統合され、恒久的にこちらへリダイレクトされます。「👨‍👩‍👧 親子向け」フィルタータグをクリックすると、親子劇場、子ども向けコンサート、親子ワークショップなど、元のページと同じ範囲の番組だけが表示されます。",
        },
      ],
    },
    ko: {
      title: "전국 문화예술 행사 및 가족 활동 안내(가족 친화 행사 포함)",
      description:
        "문화부의 전국 문화예술 행사 공공데이터를 통합하여 전국의 전시, 음악, 연극, 강연 등 다양한 행사를 조회합니다. '가족 친화' 필터 태그로 가족 극장, 어린이 음악회, 가족 워크숍을 빠르게 찾을 수 있습니다. 자료 제공: 문화부 공공데이터.",
      directAnswer:
        "문화부 문화예술 행사 정보 시스템에 실시간으로 연결하여 전국의 공연, 음악회, 강연 행사를 조회합니다. '가족 친화' 필터 태그로 전환하면 가족 극장, 어린이 음악회, 워크숍 프로그램만 볼 수 있습니다.",
      faqs: [
        {
          question: "행사 정보에는 어떤 분류가 포함되나요?",
          answer:
            "문화부의 19개 문화예술 행사 분류(전시, 음악, 연극, 무용, 가족, 강연, 영화, 인디뮤직, 버라이어티, 문화예술 경연, 콘서트, 연수 과정 등)와 전국 축제 행사, 문화생활권 시설을 모두 포함합니다.",
        },
        {
          question: "이 페이지에 기존 '전국 가족 문화예술 행사 조회'의 내용도 포함되나요?",
          answer:
            "네. 기존 '전국 가족 문화예술 행사 조회' 페이지는 이 페이지로 통합되어 영구적으로 리디렉션됩니다. '👨‍👩‍👧 가족 친화' 필터 태그를 클릭하면 가족 극장, 어린이 음악회, 가족 워크숍 등 기존 페이지와 동일한 범위의 프로그램만 볼 수 있습니다.",
        },
      ],
    },
  },
  "heritage-map": {
    en: {
      title: "Cultural Heritage Map: Monuments, Historic Buildings & Archaeological Sites",
      description:
        "Aggregates the Bureau of Cultural Heritage's open data to map Taiwan's monuments, historic buildings, and archaeological sites nationwide, with switchable map layers and lookups of each site's history and the reasons for its designation.",
      directAnswer:
        "The Cultural Heritage Map aggregates the Bureau of Cultural Heritage's open data into a map of Taiwan's monuments/historic buildings (1,700+ cases) and archaeological sites (50+ cases), with switchable layers to look up each site's name, address, history, and reasons for designation.",
      faqs: [
        {
          question: "How often is the Cultural Heritage Map's data updated?",
          answer:
            "This site periodically re-syncs cultural-heritage case data from the Bureau of Cultural Heritage's open data platform; the most recent sync time is shown at the top of the page.",
        },
        {
          question: "What do the \"Monuments/Historic Buildings\" and \"Archaeological Sites\" layers each represent?",
          answer:
            "The Monuments/Historic Buildings layer covers cases designated or registered under the Cultural Heritage Preservation Act; the Archaeological Sites layer covers nationally, municipally, and county/city-designated archaeological site cases. Both layers' record counts and designation reasons come from the Bureau of Cultural Heritage's official database.",
        },
      ],
    },
    ja: {
      title: "文化資産マップ：古跡／歴史的建築物／考古遺跡検索",
      description:
        "文化資産局のオープンデータを統合し、台湾全土の古跡、歴史的建築物、考古遺跡の位置を地図上で検索。レイヤー切り替え、沿革、登録理由の確認に対応しています。",
      directAnswer:
        "文化資産マップは文化資産局のオープンデータを統合し、台湾全土の古跡／歴史的建築物（1,700件以上）と考古遺跡（50件以上）の位置を地図上に表示。レイヤーを切り替えて名称、所在地、沿革、登録理由を確認できます。",
      faqs: [
        {
          question: "文化資産マップのデータはどのくらいの頻度で更新されますか？",
          answer:
            "本サイトは文化資産局のオープンデータプラットフォームから文化資産案件データを不定期に再同期しており、最終同期時刻はページ上部に表示されます。",
        },
        {
          question: "「古跡／歴史的建築物」と「考古遺跡」の2つのレイヤーはそれぞれ何を表しますか？",
          answer:
            "「古跡／歴史的建築物」レイヤーは文化資産保存法に基づき指定・登録された古跡・歴史的建築物の案件を、「考古遺跡」レイヤーは国定・直轄市定・県（市）定の考古遺跡案件を収録しています。件数と登録理由はいずれも文化資産局の公式データベースに基づいています。",
        },
      ],
    },
    ko: {
      title: "문화유산 지도: 고적/역사건축물/고고유적 조회",
      description:
        "문화유산청의 공공데이터를 통합하여 대만 전역의 고적, 역사건축물, 고고유적 위치를 지도에서 조회합니다. 레이어 전환과 유래, 등록 이유 조회를 지원합니다.",
      directAnswer:
        "문화유산 지도는 문화유산청의 공공데이터를 통합하여 대만 전역의 고적/역사건축물(1,700건 이상)과 고고유적(50건 이상) 위치를 지도에 표시합니다. 레이어를 전환하여 명칭, 주소, 유래, 등록 이유를 조회할 수 있습니다.",
      faqs: [
        {
          question: "문화유산 지도의 데이터는 얼마나 자주 업데이트되나요?",
          answer:
            "본 사이트는 문화유산청 공공데이터 플랫폼의 문화유산 안건 데이터를 비정기적으로 재동기화하며, 최근 동기화 시각은 페이지 상단에 표시됩니다.",
        },
        {
          question: "'고적/역사건축물'과 '고고유적' 두 레이어는 각각 무엇을 나타내나요?",
          answer:
            "'고적/역사건축물' 레이어는 문화유산보존법에 따라 지정 또는 등록된 고적 및 역사건축물 안건을 포함하며, '고고유적' 레이어는 국가, 직할시, 현(시) 지정 고고유적 안건을 포함합니다. 두 레이어의 건수와 등록 이유는 모두 문화유산청의 공식 데이터베이스를 기반으로 합니다.",
        },
      ],
    },
  },
  "tourism-factories": {
    en: {
      title: "Certified Tourism Factories Directory (Nationwide)",
      description:
        "Searches tourism factories and industrial-culture museums nationwide that have passed the Industrial Development Administration's evaluation. Source: Industrial Development Administration open data.",
      directAnswer:
        "A directory of tourism factories nationwide certified by the Industrial Development Administration, with a Northern/Central/Southern/Eastern Taiwan region filter, reservation phone numbers, factory addresses, and links to official websites.",
      faqs: [
        {
          question: "What is an Industrial Development Administration-certified tourism factory?",
          answer:
            "A traditional manufacturing factory that has passed the Industrial Development Administration's \"Tourism Factory Guidance & Evaluation\" program, offering educational-and-entertaining services such as industrial-culture exhibits, production-process tours, and hands-on DIY experiences.",
        },
        {
          question: "Do tourism factories require a reservation in advance?",
          answer:
            "Some tourism factories allow free, unguided visits, while others require joining a scheduled guided tour or calling ahead to reserve — it's best to call the phone number on the listing card before you go to confirm.",
        },
      ],
    },
    ja: {
      title: "全台認証観光工場ディレクトリ",
      description:
        "経済部産業発展署の評価に合格した全台の観光工場と産業文化館を検索。データ提供：経済部産業発展署オープンデータ。",
      directAnswer:
        "経済部産業発展署の認証を受けた全台の優良観光工場名簿を収録。北部・中部・南部・東部の地域別フィルター、見学予約の電話番号、工場所在地、公式サイトへのリンクを提供します。",
      faqs: [
        {
          question: "経済部認証観光工場とは何ですか？",
          answer:
            "経済部産業発展署の「観光工場指導評価」に合格した従来型製造工場で、産業文化の展示、製造工程の見学、DIY体験教室など、学びながら楽しめるサービスを提供しています。",
        },
        {
          question: "観光工場の見学には事前予約が必要ですか？",
          answer:
            "一部の観光工場は自由見学が可能ですが、一部はガイドツアーの回次に合わせるか事前の電話予約が必要です。出発前にカード上の電話番号へ確認の電話を入れることをお勧めします。",
        },
      ],
    },
    ko: {
      title: "전국 인증 관광공장 안내",
      description:
        "경제부 산업발전청의 평가를 통과한 전국의 관광공장과 산업문화관을 조회합니다. 자료 제공: 경제부 산업발전청 공공데이터.",
      directAnswer:
        "경제부 산업발전청의 인증을 받은 전국 우수 관광공장 명단을 수록하였으며, 북부/중부/남부/동부 지역별 분류, 예약 관람 전화번호, 공장 주소, 공식 웹사이트 링크를 제공합니다.",
      faqs: [
        {
          question: "경제부 인증 관광공장이란 무엇인가요?",
          answer:
            "경제부 산업발전청의 '관광공장 지도평가'를 통과한 전통 제조공장으로, 산업문화 전시, 생산공정 견학, DIY 체험 교육 등 교육적이면서도 즐거운 서비스를 제공합니다.",
        },
        {
          question: "관광공장 관람은 사전 예약이 필요한가요?",
          answer:
            "일부 관광공장은 자유 관람이 가능하지만, 일부는 가이드 투어 시간에 맞추거나 사전 전화 예약이 필요합니다. 방문 전 카드에 있는 전화번호로 먼저 확인 전화를 하는 것을 권장합니다.",
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
