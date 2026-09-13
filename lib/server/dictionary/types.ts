export type NativeLanguage = "twblg" | "hakka";

export interface NativeDictDefinition {
  type?: string; // 詞性 (名, 動, 形, 感, 附...)
  def: string; // 釋義
  example?: string[]; // 例句 (可能含母語與華語對照)
}

export interface NativeDictItem {
  id: number | string;
  lang: NativeLanguage;
  title: string;
  pinyin: string;
  dialect?: string | null;
  mandarin_keywords?: string | null;
  audio_id?: string | null;
  definitions: NativeDictDefinition[];
  stroke_count?: number | null;
  radical?: string | null;
}

export interface SearchNativeDictParams {
  lang?: NativeLanguage;
  q?: string;
  dialect?: string;
  topic?: string;
  page?: number;
  limit?: number;
}

export interface SearchNativeDictResult {
  items: NativeDictItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  source: "database" | "seed";
}

export interface TopicCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
  keywords: {
    twblg: string[];
    hakka: string[];
  };
}

export const CHILD_TOPIC_CATEGORIES: TopicCategory[] = [
  {
    id: "greetings",
    label: "日常問候",
    icon: "👋",
    description: "你好、謝謝、再見與日常禮貌用語",
    keywords: {
      twblg: ["你好", "食飽未", "多謝", "再會", "勞力", "歹勢", "早安", "晚安"],
      hakka: ["恁仔細", "食飽咧", "承蒙", "正來尞", "恁早", "勞力", "毋好意思"],
    },
  },
  {
    id: "family",
    label: "家庭親屬",
    icon: "👨‍👩‍👧‍👦",
    description: "爸爸、媽媽、阿公、阿嬤等親屬稱謂",
    keywords: {
      twblg: ["阿爸", "阿母", "阿公", "阿媽", "阿兄", "阿姊", "小弟", "小妹", "囡仔"],
      hakka: ["阿爸", "阿姆", "阿公", "阿婆", "阿哥", "阿姊", "老弟", "老妹", "細子"],
    },
  },
  {
    id: "body",
    label: "身體器官",
    icon: "👀",
    description: "眼睛、耳朵、鼻子、手腳與身體部位",
    keywords: {
      twblg: ["目睭", "耳仔", "鼻仔", "喙", "手", "跤", "頭毛", "腹肚"],
      hakka: ["目珠", "耳公", "鼻公", "嘴", "手", "腳", "頭毛", "肚屎"],
    },
  },
  {
    id: "animals",
    label: "動物昆蟲",
    icon: "🐾",
    description: "狗、貓、鳥、蝴蝶與自然界常見動物",
    keywords: {
      twblg: ["狗仔", "貓仔", "鳥仔", "魚仔", "胡蠅", "蠓仔", "草蜢仔", "蝶仔", "鴨仔", "雞仔"],
      hakka: ["狗仔", "貓仔", "鳥仔", "魚仔", "揚尾仔", "蚊仔", "草蜢仔", "鴨仔", "雞仔"],
    },
  },
  {
    id: "food",
    label: "美味飲食",
    icon: "🍚",
    description: "吃飯、喝水、水果與台灣在地美食",
    keywords: {
      twblg: ["食飯", "啉水", "菜", "肉", "果子", "點心", "米粉", "麵", "肉燥", "柑仔"],
      hakka: ["食事", "食茶", "菜", "肉", "果子", "點心", "粄", "麵", "柑仔"],
    },
  },
  {
    id: "nature",
    label: "大自然與天氣",
    icon: "🌈",
    description: "太陽、月亮、下雨、彩虹與季節自然現象",
    keywords: {
      twblg: ["日頭", "月娘", "落雨", "天頂", "風", "雲", "虹", "地動", "山", "海"],
      hakka: ["日頭", "月光", "落水", "天頂", "風", "雲", "天弓", "地動", "山", "海"],
    },
  },
  {
    id: "school",
    label: "學校生活",
    icon: "🎒",
    description: "讀書、寫字、老師、同學與校園活動",
    keywords: {
      twblg: ["讀冊", "寫字", "先生", "同學", "冊包", "學校", "畫圖", "𨑨迌", "唱歌"],
      hakka: ["讀書", "寫字", "先生", "同學", "書包", "學校", "畫圖", "搞", "唱歌"],
    },
  },
];
