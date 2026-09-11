export interface CulturalShowInfo {
  time: string;
  location: string;
  locationName: string;
  city?: string | null;
  onSales?: string;
  price?: string;
  latitude?: number | null;
  longitude?: number | null;
  endTime?: string;
}

export interface CulturalActivityItem {
  id: string;
  title: string;
  titleEn?: string | null;
  category: string;
  categoryLabel: string;
  description: string;
  descriptionEn?: string | null;
  imageUrl?: string | null;
  masterUnit?: string | null;
  startDate: string;
  endDate: string;
  sourceWebPromote?: string | null;
  webSales?: string | null;
  shows: CulturalShowInfo[];
  extraJson?: Record<string, unknown> | null;
}

export interface PublicArtItem {
  id: string;
  artNo: string;
  title: string;
  artist: string;
  dimensions?: string | null;
  material?: string | null;
  city: string;
  location: string;
  lat: number | null;
  lng: number | null;
  fieldType?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  year?: string | null;
  sourceUrl?: string | null;
  agency?: string | null;
  distanceKm?: number;
  extraJson?: Record<string, unknown> | null;
}

export const CATEGORY_LABELS: Record<string, string> = {
  "1": "🎵 音樂表演",
  "2": "🎭 戲劇演出",
  "3": "💃 舞蹈表演",
  "4": "🎨 親子活動",
  "5": "🎸 獨立音樂",
  "6": "🖼️ 藝文展覽",
  "7": "🎤 講座工作坊",
  "8": "🎬 電影與沉浸",
  "9": "🎪 聚會市集",
  "10": "🏮 民俗節慶",
  "11": "🤹 綜藝表演",
  "12": "🗺️ 觀光文化",
  "13": "🏆 藝文競賽",
  "14": "📣 徵選甄選",
  "15": "📌 其他多元",
  "16": "🏅 競賽活動",
  "17": "✨ 演唱會活動",
  "18": "🚶 導覽走讀",
  "19": "📚 研習課程",
  festival: "🏮 全國節慶活動",
  venue_h: "🏛️ 文化生活圈場館",
  npo: "🤝 公益活動",
  charity_project: "❤️ 公益專案/線上募款",
  ticketing: "🎟️ 售票展演",
};

export const ALL_CATEGORIES = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "festival",
  "venue_h",
  "npo",
  "charity_project",
  "ticketing",
];


