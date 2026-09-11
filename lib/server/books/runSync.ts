import "server-only";
import { getPool } from "@/lib/server/db/mysql";
import { BOOKS_CATEGORIES } from "./categories";
import { scrapeCategory } from "./scraper";
import type { ResultSetHeader } from "mysql2/promise";

export interface BooksSyncSummary {
  ok: boolean;
  categoriesProcessed: number;
  totalSynced: number;
  cleanedOldBooks: number;
  errors: string[];
}

/**
 * Daily 05:30 off-peak cron job:
 * Syncs books from Books.com.tw, Eslite, and TAAZE.
 * Keeps Top 20 books per category and cleans up older unranked records.
 */
export async function runLatestBooksSync(): Promise<BooksSyncSummary> {
  const summary: BooksSyncSummary = {
    ok: true,
    categoriesProcessed: 0,
    totalSynced: 0,
    cleanedOldBooks: 0,
    errors: [],
  };

  const pool = getPool();
  if (!pool) {
    summary.ok = false;
    summary.errors.push("MySQL connection pool unavailable");
    return summary;
  }

  for (const cat of BOOKS_CATEGORIES) {
    try {
      const books = await scrapeCategory(cat);
      if (books.length === 0) continue;

      // Keep only top 20 for this category
      const top20 = books.slice(0, 20);

      for (const b of top20) {
        await pool.execute<ResultSetHeader>(
          `INSERT INTO latest_books (
            platform, category_id, category_name, ranking, title, subtitle,
            author, translator, publisher, publish_date, cover_url, product_url,
            isbn, list_price, sale_price, discount, description, payload_hash,
            synced_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
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
            synced_at = NOW(),
            updated_at = NOW()`,
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
          ]
        );
        summary.totalSynced++;
      }

      // Clean up records in this category beyond rank 20
      const [delResult] = await pool.execute<ResultSetHeader>(
        "DELETE FROM latest_books WHERE category_id = ? AND ranking > 20",
        [cat.id]
      );
      summary.cleanedOldBooks += delResult.affectedRows || 0;
      summary.categoriesProcessed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`Error syncing category ${cat.id}: ${msg}`);
    }
  }

  if (summary.errors.length > 0 && summary.totalSynced === 0) {
    summary.ok = false;
  }

  return summary;
}
