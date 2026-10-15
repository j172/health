/**
 * News topic classification (issue #565, parent spec #562).
 *
 * `classifyNewsTopics` is a pure function — no DB, no network — so it can be
 * called from both the single news writer (lib/server/rss/persistItems.ts)
 * and a one-off backfill script (scripts/backfill-news-topics.mjs) without
 * either one needing a live database connection to exercise the logic in
 * tests. Modeled on the "keyword → label" rule table in
 * lib/server/news/imageSearchTerms.ts's KEYWORD_TERMS, but:
 *   - returns an array of topics (an article can carry more than one, or
 *     zero) instead of picking a single best match, and
 *   - every rule carries its own `exclude` guard alongside `include`, so a
 *     broad include pattern added later doesn't need a parallel narrowing of
 *     every other rule — see the 毒蛇/菸酒公賣 cases below.
 *
 * `Topic` and the rule/override tables are deliberately not hardcoded to
 * "exactly two topics" anywhere in the matching logic — issue #568 (new news
 * sources), #570 (fraud-check tool's news section) and #574 (scenario page)
 * all consume this module's output, and #562's plan explicitly calls for the
 * interface to support more topics than anti-fraud/anti-drug/tobacco without
 * a rewrite. Adding a fourth topic is just adding entries to `TOPIC_RULES`
 * (and `ALL_TOPICS`) — every caller (classifier, DB schema, query filters)
 * already takes `Topic`/`string` generically.
 */

export type Topic = "anti-fraud" | "anti-drug" | "tobacco";

export const ALL_TOPICS: readonly Topic[] = ["anti-fraud", "anti-drug", "tobacco"];

export const isTopic = (value: string): value is Topic =>
  (ALL_TOPICS as readonly string[]).includes(value);

interface TopicRule {
  topic: Topic;
  /** Any one of these matching the title+summary text is a hit. */
  include: RegExp[];
  /**
   * Any one of these matching means the hit above is discarded — e.g. a
   * broader "喪屍煙彈" include pattern should not light up `tobacco` just
   * because the string contains "煙"; a "毒蛇" story should never light up
   * `anti-drug`. Each rule's own excludes are checked only against that
   * rule's own hit, so a `tobacco` exclude never suppresses an `anti-drug`
   * match on the same article and vice versa.
   */
  exclude?: RegExp[];
}

/**
 * Regex rule table. Every `include` pattern below is a specific compound
 * term rather than a single character (e.g. "毒品" / "戒菸", never a bare
 * "毒" or "菸") — that alone is what keeps "毒蛇咬傷"、"菸酒公賣"、"製菸業"
 * from matching in the first place. The `exclude` lists exist as a second,
 * explicit line of defense so a future contributor who *does* broaden a
 * pattern (e.g. to bare "菸" to catch more headlines) doesn't silently
 * reintroduce those false positives — see the accompanying tests.
 */
const TOPIC_RULES: TopicRule[] = [
  {
    topic: "anti-fraud",
    include: [
      /詐騙|詐欺|詐團|騙取|行騙/,
      /車手|取款車手/,
      /假投資|投資詐騙|虛擬貨幣詐騙|博弈詐騙|博弈網站/,
      /解除分期|解除分期付款/,
      /假冒公務員|假冒檢察官|假冒警察|假冒銀行|假冒客服/,
      /圈存|止扣|防詐圈存/,
      /165專線|165全民防騙網|撥打165|報案165|165反詐騙諮詢專線/,
      /打詐|識詐|反詐騙|停止解析.*(涉詐|詐騙)網/,
      /假網拍|網路購物詐騙|簡訊詐騙|釣魚簡訊|釣魚網站|假交友|愛情詐騙/,
    ],
  },
  {
    topic: "anti-drug",
    include: [
      /毒品/,
      /嗑藥|毒梟|毒癮|吸毒|販毒|運毒|製毒|毒窟|毒駕|查緝毒品|持有毒品|施用毒品|販售毒品/,
      /戒毒|美沙冬|毒防中心|毒防局|毒品危害防制/,
      /緝毒|緝獲.*毒品/,
      /愷他命|卡他命|K他命|安非他命|海洛因|大麻(?!布|繩|織品)|搖頭丸|吸食毒品/,
      /喪屍煙彈|殭屍煙彈/,
    ],
    exclude: [/毒蛇|蛇毒|毒蜘蛛|毒蠍|河豚毒|食物中毒|一氧化碳中毒|農藥中毒|重金屬中毒|生物鹼中毒/],
  },
  {
    topic: "tobacco",
    include: [
      /電子煙|加熱菸|加熱式菸品|新型菸品|違法菸品/,
      /戒菸|戒菸門診|戒菸專線|戒菸衛教|二代戒菸/,
      /菸害|菸害防制法|菸害檢舉/,
      /尼古丁/,
      /吸菸|菸品管理/,
    ],
    exclude: [/菸酒公賣|菸酒稅|菸酒管理法|製菸業|菸葉(種植|產業|契作)|菸酒管理處/],
  },
];

/**
 * Source → fixed topic(s) override, for news sources that are themselves
 * single-topic by nature and don't need (or can't reliably get) a keyword
 * match — e.g. 反毒大本營, a MOHW anti-drug-only news source that issue #568
 * adds. Checked before any keyword rule; a hit here returns immediately
 * without running TOPIC_RULES at all.
 *
 * #565 only built the mechanism, leaving this empty. #568 adds the first
 * real entry: 反毒大本營（antidrug.moj.gov.tw, sourceName "antidrug"）is a
 * MOJ anti-drug news aggregator by nature — every article it curates is
 * already anti-drug coverage of some outlet's reporting, so running
 * TOPIC_RULES against its (often body-less, see fetchAntidrugNews.ts)
 * title text would both be redundant and risk a false "no topic" on a
 * headline that doesn't happen to contain one of this file's compound
 * keywords. Kept as a mutable exported const (rather than, say, a function)
 * so a later ticket can just add a key without touching this file's logic.
 */
export const SOURCE_TOPIC_OVERRIDES: Partial<Record<string, Topic[]>> = {
  antidrug: ["anti-drug"],
};

export interface ClassifyNewsTopicsInput {
  title: string;
  summary?: string | null;
  sourceName?: string | null;
}

/**
 * Classifies a news item into zero or more topics. Pure function: same
 * input always produces the same output, no I/O.
 *
 * `sourceOverrides` defaults to the module-level `SOURCE_TOPIC_OVERRIDES`
 * but can be overridden by callers (tests included) to exercise the
 * source-override path without depending on a real entry existing there.
 */
export function classifyNewsTopics(
  input: ClassifyNewsTopicsInput,
  sourceOverrides: Partial<Record<string, Topic[]>> = SOURCE_TOPIC_OVERRIDES,
): Topic[] {
  const sourceName = input.sourceName?.trim();
  if (sourceName) {
    const fixed = sourceOverrides[sourceName];
    if (fixed) {
      return [...fixed];
    }
  }

  const haystack = `${input.title ?? ""} ${input.summary ?? ""}`;
  if (!haystack.trim()) return [];

  const matched: Topic[] = [];
  for (const rule of TOPIC_RULES) {
    const hit = rule.include.some((pattern) => pattern.test(haystack));
    if (!hit) continue;
    const excluded = rule.exclude?.some((pattern) => pattern.test(haystack)) ?? false;
    if (excluded) continue;
    matched.push(rule.topic);
  }
  return matched;
}
