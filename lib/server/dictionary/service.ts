import {
  CHILD_TOPIC_CATEGORIES,
  type NativeDictItem,
  type SearchNativeDictParams,
  type SearchNativeDictResult,
} from "./types";
import { readTransientSeedJson } from "@/lib/server/db/transientSeed";

interface SeedLanguageSection {
  count: number;
  entries: NativeDictItem[];
}

interface SeedStructure {
  languages: {
    twblg: SeedLanguageSection;
    hakka: SeedLanguageSection;
  };
}

/**
 * 資料庫沒資料（或連不上）時的後備種子，約 30 MB。
 *
 * 絕對不能 `import … from "@/data/child-native-languages-seed.json"`：Next 預設開機就載入全部
 * 路由，被打包進 chunk 的 JSON 會變成永遠常駐的原始碼字串（≈ 24 MB），第一次執行後再多一份
 * 解析後的物件（≈ 21 MB）。這個 API 在正式站 18 天只被打了 12 次（#709）。
 *
 * 改成真的需要後備時才用 `readTransientSeedJson`（lib/server/db/transientSeed.ts）讀 `public/data/`
 * （或 `data/`）並解析，解析結果只保留 {@link SEED_TTL_MS} 毫秒（從載入時起算），到期後交給 GC。
 * 找不到檔案時該 helper 會寫一行 `[seed]` 警告並回傳 null，這裡退成空資料（和以前
 * `entries || []` 的形狀相同）。TTL 比 helper 預設的 60 秒長：重新解析 30 MB 要 ≈ 270 ms，
 * 2 分鐘內的連續請求共用同一份。
 */
const SEED_FILENAME = "child-native-languages-seed.json";
const SEED_TTL_MS = 2 * 60 * 1000;

function loadSeedPool(lang: string): NativeDictItem[] {
  const seed = readTransientSeedJson<SeedStructure>(SEED_FILENAME, { ttlMs: SEED_TTL_MS });
  if (!seed) return [];
  return (seed.languages as Record<string, SeedLanguageSection | undefined>)[lang]?.entries || [];
}

export async function searchNativeDict(
  params: SearchNativeDictParams,
): Promise<SearchNativeDictResult> {
  const lang = params.lang || "twblg";
  const query = (params.q || "").trim().toLowerCase();
  const dialect = (params.dialect || "").trim().toLowerCase();
  const topicId = (params.topic || "").trim();
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));

  // Try querying MySQL database first if configured
  if (process.env.DATABASE_URL || process.env.MYSQL_HOST) {
    try {
      const { withConnection } = await import("@/lib/server/db/mysql");
      const dbResult = await withConnection(async (conn) => {
        let sql = "SELECT * FROM native_dict_entries WHERE lang = ?";
        const values: any[] = [lang];

        if (query) {
          sql += " AND (title LIKE ? OR pinyin LIKE ? OR mandarin_keywords LIKE ?)";
          const qParam = `%${query}%`;
          values.push(qParam, qParam, qParam);
        }

        if (dialect && dialect !== "all") {
          sql += " AND dialect LIKE ?";
          values.push(`%${dialect}%`);
        }

        let countSql = sql.replace("SELECT *", "SELECT COUNT(*) as total");
        const [countRows]: any = await conn.query(countSql, values);
        const total = Number(countRows?.[0]?.total || 0);

        sql += " ORDER BY id ASC LIMIT ? OFFSET ?";
        values.push(limit, (page - 1) * limit);

        const [rows]: any = await conn.query(sql, values);
        if (rows && rows.length > 0) {
          const items: NativeDictItem[] = rows.map((r: any) => ({
            id: r.id,
            lang: r.lang,
            title: r.title,
            pinyin: r.pinyin,
            dialect: r.dialect,
            mandarin_keywords: r.mandarin_keywords,
            audio_id: r.audio_id,
            definitions: JSON.parse(r.definitions_json || "[]"),
            stroke_count: r.stroke_count,
            radical: r.radical,
          }));

          return {
            items,
            total,
            page,
            pageSize: limit,
            totalPages: Math.ceil(total / limit),
            source: "database" as const,
          };
        }
        return null;
      });

      if (dbResult) {
        return dbResult;
      }
    } catch (err) {
      console.warn("[searchNativeDict] DB query failed, falling back to seed:", err);
    }
  }

  // Fallback to local high-frequency seed dataset
  const pool: NativeDictItem[] = loadSeedPool(lang);

  let filtered = pool;

  // Filter by topic category if specified
  if (topicId) {
    const topicConfig = CHILD_TOPIC_CATEGORIES.find((c) => c.id === topicId);
    if (topicConfig) {
      const keywords = topicConfig.keywords[lang] || [];
      filtered = filtered.filter((item) =>
        keywords.some(
          (kw) =>
            item.title.includes(kw) ||
            (item.mandarin_keywords && item.mandarin_keywords.includes(kw)),
        ),
      );
    }
  }

  // Filter by text search (title, pinyin, mandarin explanation)
  if (query) {
    filtered = filtered.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(query);
      const matchPinyin = item.pinyin.toLowerCase().includes(query);
      const matchMandarin =
        item.mandarin_keywords &&
        item.mandarin_keywords.toLowerCase().includes(query);
      return matchTitle || matchPinyin || matchMandarin;
    });
  }

  const total = filtered.length;
  const offset = (page - 1) * limit;
  const items = filtered.slice(offset, offset + limit);

  return {
    items,
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    source: "seed",
  };
}

export async function getNativeDictWord(
  lang: "twblg" | "hakka",
  word: string,
): Promise<NativeDictItem | null> {
  const result = await searchNativeDict({ lang, q: word, limit: 10 });
  const exact = result.items.find((item) => item.title === word);
  return exact || result.items[0] || null;
}
