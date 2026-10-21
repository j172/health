import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { TAIWAN_COUNTIES } from "@/lib/constants/taiwanDistricts";
import { SENIOR_CARD_SUBSIDIES_SEED } from "./data/seniorCardSeed";
import type { SeniorCardEntry, SeniorCardOverview } from "./types";

interface DbSeniorCardRow extends RowDataPacket {
  county: string;
  card_name: string | null;
  info_url: string | null;
  category: string | null;
  description: string | null;
}

/**
 * 只在 senior_card_subsidies 為空時灌入靜態種子（比照
 * lib/server/transit/queries.ts 的 ensureTransitSeeded() 慣用法）。
 * issue #729 起敬老卡不再有排程同步：表裡已有資料（先前 TDX 同步寫入的真實列，
 * 或管理員手動呼叫 /api/admin/senior-card-sync 更新後的列）一律優先，種子只是後備。
 */
export async function ensureSeniorCardSeeded(): Promise<void> {
  await withConnection(async (conn) => {
    const [cardCount] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM senior_card_subsidies",
    );
    if ((cardCount[0]?.cnt || 0) === 0) {
      for (const s of SENIOR_CARD_SUBSIDIES_SEED) {
        await conn.execute(
          `INSERT INTO senior_card_subsidies (county, card_name, info_url, category, description)
           VALUES (?, ?, ?, ?, ?)`,
          [s.county, s.cardName, s.infoUrl, s.category, s.description],
        );
      }
    }
  });
}

export async function getSeniorCardOverview(filter?: {
  county?: string;
}): Promise<SeniorCardOverview> {
  await ensureSeniorCardSeeded();

  return await withConnection(async (conn) => {
    const county = filter?.county && filter.county !== "all" ? filter.county : undefined;

    // 依 (county, card_name, info_url) 分組成 {county, cardName, infoUrl, subsidies[]}。
    let cardSql = "SELECT * FROM senior_card_subsidies WHERE 1=1";
    const cardParams: string[] = [];
    if (county) {
      cardSql += " AND county = ?";
      cardParams.push(county);
    }
    cardSql += " ORDER BY county ASC, id ASC";
    const [cardRows] = await conn.query<DbSeniorCardRow[]>(cardSql, cardParams);

    const cardGroups = new Map<string, SeniorCardEntry>();
    for (const r of cardRows) {
      const key = `${r.county}::${r.card_name || ""}::${r.info_url || ""}`;
      let entry = cardGroups.get(key);
      if (!entry) {
        entry = { county: r.county, cardName: r.card_name, infoUrl: r.info_url, subsidies: [] };
        cardGroups.set(key, entry);
      }
      if (r.category || r.description) {
        entry.subsidies.push({ category: r.category, description: r.description });
      }
    }

    return {
      seniorCards: Array.from(cardGroups.values()),
      counties: Array.from(TAIWAN_COUNTIES),
    };
  });
}
