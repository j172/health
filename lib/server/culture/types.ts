export interface CulturalShowInfo {
  time: string;
  location: string;
  locationName: string;
  onSales?: string;
  price?: string;
  latitude?: number | null;
  longitude?: number | null;
  endTime?: string;
}

export interface CulturalActivityItem {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  description: string;
  imageUrl?: string | null;
  masterUnit?: string | null;
  startDate: string;
  endDate: string;
  sourceWebPromote?: string | null;
  webSales?: string | null;
  shows: CulturalShowInfo[];
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
}

export const CATEGORY_LABELS: Record<string, string> = {
  "1": "🎵 音樂表演",
  "2": "🎭 戲劇演出",
  "3": "💃 舞蹈表演",
  "4": "🎨 親子活動",
  "6": "🖼️ 藝文展覽",
  "7": "🎤 講座工作坊",
  "8": "🎬 電影與沉浸",
  "17": "✨ 綜藝節慶",
};

export const ALL_CATEGORIES = ["6", "1", "2", "3", "4", "7", "8"];

