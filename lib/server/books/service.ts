import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { withConnection, utcNowSql, ensureSchema } from "@/lib/server/db/mysql";
import type { BookItem, BookListResponse, BookQueryParams } from "./types";
import { BOOKS_CATEGORIES, getCategoryById } from "./categories";
import { scrapeCategory } from "./scraper";

const SEED_PATH = path.join(process.cwd(), "data", "latest-books-seed.json");

/**
 * Load offline seed books as reliable fallback.
 */
export function loadOfflineBooksSeed(): BookItem[] {
  try {
    if (fs.existsSync(SEED_PATH)) {
      const raw = fs.readFileSync(SEED_PATH, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data.books)) {
        return data.books;
      }
    }
  } catch (err) {
    console.error("[loadOfflineBooksSeed] Failed to read seed:", err);
  }
  return [];
}

/**
 * Filter and sort an in-memory array of books (used for offline fallback).
 */
export function filterAndSortBooks(books: BookItem[], params: BookQueryParams): BookListResponse {
  let filtered = [...books];

  if (params.platform) {
    filtered = filtered.filter((b) => b.platform === params.platform);
  }

  if (params.categoryId) {
    filtered = filtered.filter((b) => b.categoryId === params.categoryId);
  }

  if (params.search) {
    const query = params.search.toLowerCase().trim();
    filtered = filtered.filter(
      (b) =>
        b.title.toLowerCase().includes(query) ||
        (b.author && b.author.toLowerCase().includes(query)) ||
        (b.publisher && b.publisher.toLowerCase().includes(query)) ||
        (b.categoryName && b.categoryName.toLowerCase().includes(query)),
    );
  }

  // Sorting
  if (params.sortBy === "ranking") {
    filtered.sort((a, b) => (a.ranking ?? 999) - (b.ranking ?? 999));
  } else if (params.sortBy === "priceAsc") {
    filtered.sort((a, b) => (a.salePrice ?? 99999) - (b.salePrice ?? 99999));
  } else if (params.sortBy === "priceDesc") {
    filtered.sort((a, b) => (b.salePrice ?? 0) - (a.salePrice ?? 0));
  } else if (params.sortBy === "publishDate") {
    filtered.sort((a, b) => (b.publishDate || "").localeCompare(a.publishDate || ""));
  }

  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, Math.min(100, params.limit || 24));
  const offset = (page - 1) * limit;

  const paginated = filtered.slice(offset, offset + limit);

  return {
    ok: true,
    total: filtered.length,
    page,
    limit,
    source: "offline_seed",
    books: paginated,
    categories: BOOKS_CATEGORIES,
  };
}

/**
 * Query latest books: DB first, with offline seed fallback.
 */
export async function getLatestBooks(params: BookQueryParams): Promise<BookListResponse> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, Math.min(100, params.limit || 24));
  const offset = (page - 1) * limit;

  try {
    return await withConnection(async (conn) => {
      await ensureSchema();

      const conditions: string[] = [];
      const values: any[] = [];

      if (params.platform) {
        conditions.push("platform = ?");
        values.push(params.platform);
      }

      if (params.categoryId) {
        conditions.push("category_id = ?");
        values.push(params.categoryId);
      }

      if (params.search) {
        conditions.push("(title LIKE ? OR author LIKE ? OR publisher LIKE ? OR category_name LIKE ?)");
        const searchPattern = `%${params.search.trim()}%`;
        values.push(searchPattern, searchPattern, searchPattern, searchPattern);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // Count query
      const [countRows] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) as total FROM latest_books ${whereClause}`,
        values,
      );
      const total = Number(countRows[0]?.total || 0);

      if (total === 0) {
        // If DB has no records for this query, fall back to prebuilt seed
        const seedBooks = loadOfflineBooksSeed();
        return filterAndSortBooks(seedBooks, params);
      }

      // Order clause
      let orderClause = "ORDER BY ranking ASC, updated_at DESC";
      if (params.sortBy === "priceAsc") {
        orderClause = "ORDER BY sale_price ASC";
      } else if (params.sortBy === "priceDesc") {
        orderClause = "ORDER BY sale_price DESC";
      } else if (params.sortBy === "publishDate") {
        orderClause = "ORDER BY publish_date DESC, updated_at DESC";
      }

      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT
          id, platform, category_id as categoryId, category_name as categoryName,
          ranking, title, subtitle, author, translator, publisher,
          publish_date as publishDate, cover_url as coverUrl, product_url as productUrl,
          isbn, list_price as listPrice, sale_price as salePrice, discount,
          description, payload_hash as payloadHash, created_at as createdAt, updated_at as updatedAt
        FROM latest_books
        ${whereClause}
        ${orderClause}
        LIMIT ? OFFSET ?`,
        [...values, limit, offset],
      );

      const books: BookItem[] = rows.map((r: any) => ({
        id: r.id,
        platform: r.platform,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        ranking: r.ranking,
        title: r.title,
        subtitle: r.subtitle,
        author: r.author,
        translator: r.translator,
        publisher: r.publisher,
        publishDate: r.publishDate,
        coverUrl: r.coverUrl,
        productUrl: r.productUrl,
        isbn: r.isbn,
        listPrice: r.listPrice,
        salePrice: r.salePrice,
        discount: r.discount,
        description: r.description,
        payloadHash: r.payloadHash,
        createdAt: r.createdAt?.toISOString?.() || String(r.createdAt || ""),
        updatedAt: r.updatedAt?.toISOString?.() || String(r.updatedAt || ""),
      }));

      return {
        ok: true,
        total,
        page,
        limit,
        source: "database",
        books,
        categories: BOOKS_CATEGORIES,
      };
    });
  } catch (error: any) {
    console.warn(`[getLatestBooks] DB query failed, falling back to offline seed: ${error.message}`);
    const seedBooks = loadOfflineBooksSeed();
    return filterAndSortBooks(seedBooks, params);
  }
}

/**
 * Scrapes and upserts latest books into the MySQL database.
 */
export async function syncBooksFromSources(categoryIds?: string[]): Promise<{
  synced: number;
  inserted: number;
  updated: number;
}> {
  const targetCategories = categoryIds && categoryIds.length > 0
    ? BOOKS_CATEGORIES.filter((c) => categoryIds.includes(c.id))
    : BOOKS_CATEGORIES;

  let totalSynced = 0;
  let totalInserted = 0;
  let totalUpdated = 0;

  for (const cat of targetCategories) {
    const books = await scrapeCategory(cat);
    if (books.length === 0) continue;

    try {
      await withConnection(async (conn) => {
        await ensureSchema();

        for (const b of books) {
          const now = utcNowSql();
          const [result] = await conn.execute<ResultSetHeader>(
            `INSERT INTO latest_books (
              platform, category_id, category_name, ranking, title, subtitle,
              author, translator, publisher, publish_date, cover_url, product_url,
              isbn, list_price, sale_price, discount, description, payload_hash,
              synced_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              category_name = VALUES(category_name),
              ranking = VALUES(ranking),
              title = VALUES(title),
              subtitle = VALUES(subtitle),
              author = VALUES(author),
              translator = VALUES(translator),
              publisher = VALUES(publisher),
              publish_date = VALUES(publish_date),
              cover_url = VALUES(cover_url),
              list_price = VALUES(list_price),
              sale_price = VALUES(sale_price),
              discount = VALUES(discount),
              description = VALUES(description),
              payload_hash = VALUES(payload_hash),
              synced_at = VALUES(synced_at),
              updated_at = VALUES(updated_at)`,
            [
              b.platform,
              b.categoryId,
              b.categoryName,
              b.ranking,
              b.title,
              b.subtitle,
              b.author,
              b.translator,
              b.publisher,
              b.publishDate,
              b.coverUrl,
              b.productUrl,
              b.isbn,
              b.listPrice,
              b.salePrice,
              b.discount,
              b.description,
              b.payloadHash,
              now,
              now,
              now,
            ],
          );

          totalSynced++;
          if (result.affectedRows === 1) {
            totalInserted++;
          } else if (result.affectedRows === 2) {
            totalUpdated++;
          }
        }
      });
    } catch (dbErr: any) {
      console.error(`[syncBooksFromSources] DB upsert failed for category ${cat.name}:`, dbErr.message);
    }
  }

  return { synced: totalSynced, inserted: totalInserted, updated: totalUpdated };
}
