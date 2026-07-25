import "server-only";
import type { ResultSetHeader } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";

/**
 * Deletes previously-scraped "image" assets that are actually site-chrome
 * (logos, favicons, breadcrumb/toolbar icons, government-portal badges)
 * rather than real article photos. These were picked up by an earlier
 * version of fetchDetailPage.ts, which fell back to scanning the whole
 * <body> for sites with no <article>/<main>/#maincontent container and had
 * no way to tell chrome images from content. Once removed, the affected
 * articles become eligible for a Pixabay-assigned card image again.
 */
const CHROME_IMAGE_PATTERNS = [
  "%logo%",
  "%favicon%",
  "%icon%",
  "%egov%",
  "%/home.svg",
  "%/aa.png",
  "%/aa.gif",
  "%/assets/images/x.png", // ltn.com.tw's "no photo" placeholder
  "%/images/title/%", // fda.gov.tw's page-title banner image
  "%/images/qr%", // hpa.gov.tw's QR-code widget
];

export const deleteChromeImageAssets = async (): Promise<number> =>
  withConnection(async (conn) => {
    const conditions = CHROME_IMAGE_PATTERNS.map(() => "url LIKE ?").join(" OR ");
    const [result] = await conn.execute<ResultSetHeader>(
      `DELETE FROM news_assets WHERE asset_type = 'image' AND (${conditions})`,
      CHROME_IMAGE_PATTERNS,
    );
    return result.affectedRows;
  });
