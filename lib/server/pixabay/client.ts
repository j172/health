import "server-only";
import { env } from "@/lib/server/config/env";
import { httpGetText } from "@/lib/server/net/httpClient";

const API_URL = "https://pixabay.com/api/";
const REQUEST_TIMEOUT_MS = 12_000;

export interface PixabayImage {
  id: number;
  pageURL: string;
  user: string;
  webformatURL: string;
  webformatWidth: number;
  webformatHeight: number;
  largeImageURL?: string;
  imageWidth: number;
  imageHeight: number;
}

export interface PixabaySearchResponse {
  total: number;
  totalHits: number;
  hits: PixabayImage[];
}

export class PixabayConfigurationError extends Error {
  constructor() {
    super("PIXABAY_API_KEY is not configured.");
    this.name = "PixabayConfigurationError";
  }
}

export const searchHealthImages = async (page: number, perPage = 200): Promise<PixabaySearchResponse> => {
  if (!env.pixabayApiKey) {
    throw new PixabayConfigurationError();
  }

  const params = new URLSearchParams({
    key: env.pixabayApiKey,
    category: "health",
    image_type: "photo",
    orientation: "horizontal",
    safesearch: "true",
    min_width: "960",
    min_height: "540",
    order: "popular",
    page: String(page),
    per_page: String(Math.min(200, Math.max(3, perPage))),
  });

  const response = await httpGetText(`${API_URL}?${params.toString()}`, {
    timeoutMs: REQUEST_TIMEOUT_MS,
    headers: { Accept: "application/json" },
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Pixabay API request failed with HTTP ${response.status}.`);
  }

  const payload = JSON.parse(response.text) as Partial<PixabaySearchResponse>;
  if (!Array.isArray(payload.hits)) {
    throw new Error("Pixabay API returned an invalid response.");
  }

  return {
    total: Number(payload.total || 0),
    totalHits: Number(payload.totalHits || 0),
    hits: payload.hits.filter(
      (hit): hit is PixabayImage =>
        Number.isInteger(hit?.id) &&
        hit.id > 0 &&
        typeof hit.pageURL === "string" &&
        typeof hit.webformatURL === "string" &&
        hit.webformatURL.startsWith("https://"),
    ),
  };
};