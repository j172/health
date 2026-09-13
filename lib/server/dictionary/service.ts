import {
  NativeDictItem,
  SearchNativeDictParams,
  SearchNativeDictResult,
  CHILD_TOPIC_CATEGORIES,
} from "./types";
import seedData from "@/data/child-native-languages-seed.json";

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

const typedSeed = seedData as unknown as SeedStructure;

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
  const pool: NativeDictItem[] =
    typedSeed.languages[lang]?.entries || [];

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
