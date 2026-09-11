export type BookPlatform = "books_com_tw" | "eslite";

export interface BookCategoryConfig {
  id: string;
  platform: BookPlatform;
  name: string;
  url: string;
  description?: string;
}

export interface BookItem {
  id?: number;
  platform: BookPlatform;
  categoryId: string;
  categoryName: string;
  ranking: number | null;
  title: string;
  subtitle: string | null;
  author: string | null;
  translator: string | null;
  publisher: string | null;
  publishDate: string | null;
  coverUrl: string | null;
  productUrl: string;
  isbn: string | null;
  listPrice: number | null;
  salePrice: number | null;
  discount: string | null;
  description: string | null;
  payloadHash: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BookQueryParams {
  platform?: BookPlatform;
  categoryId?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: "ranking" | "publishDate" | "priceAsc" | "priceDesc";
}

export interface BookListResponse {
  ok: boolean;
  total: number;
  page: number;
  limit: number;
  source: "database" | "offline_seed";
  books: BookItem[];
  categories: BookCategoryConfig[];
}
