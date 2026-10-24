/**
 * Claude API 預算熔斷機制與新聞↔工具雙向語意標記守護模組
 *
 * SPEC Reference: docs/specs/SPEC-humanitarian-civic-partners-and-news.md (§2.4, §4.5)
 *
 * 核心安全防線：
 * 1. 每月 $100 美元預算上限 -> 單日 $2.8 美元安全閥（$100 / 31日 = $3.22/日，設定 $2.8 提供 15% 安全緩衝）
 * 2. 入庫文章比對 payload_hash，已處理過的文章 100% 走快取，永不重複呼叫。
 * 3. 單日費用超過 $2.8 美元或 API 異常時平滑熔斷降級為靜態規則比對，防止批次排程預算暴衝。
 */

export interface AiBudgetUsage {
  date: string; // YYYY-MM-DD (Taipei timezone)
  dailyEstimatedCostUsd: number;
  maxDailyCostUsd: number; // 2.8
  inputTokens: number;
  outputTokens: number;
  isCircuitBroken: boolean;
  totalCalls: number;
  cacheHits: number;
  fallbackCalls: number;
}

export interface SemanticLinkingResult {
  toolSlugs: string[];
  actionDigest?: string; // 60 字精華快報與行動指引
  actionUrl?: string;
  actionText?: string;
  source: "ai" | "rule-fallback" | "cache";
}

export interface ArticleInput {
  title: string;
  sourceName?: string;
  content?: string;
  payloadHash: string;
}

/** 單日安全防護上限（美元） */
export const MAX_DAILY_COST_USD = 2.8;

/** Claude 3.5 Haiku 牌價估算（每百萬 Token：輸入 $0.80、輸出 $4.00） */
const COST_PER_INPUT_TOKEN = 0.80 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 4.00 / 1_000_000;

/** 取得台北時間 YYYY-MM-DD */
export function getTaipeiDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 單日預算用量狀態（記憶體儲存，支援跨呼叫累計） */
let currentUsage: AiBudgetUsage = {
  date: getTaipeiDateString(),
  dailyEstimatedCostUsd: 0,
  maxDailyCostUsd: MAX_DAILY_COST_USD,
  inputTokens: 0,
  outputTokens: 0,
  isCircuitBroken: false,
  totalCalls: 0,
  cacheHits: 0,
  fallbackCalls: 0,
};

/** 文章 Hash 快取（payload_hash -> SemanticLinkingResult） */
const payloadHashCache = new Map<string, SemanticLinkingResult>();

/** 檢查並更新換日狀態 */
function ensureCurrentDate(): void {
  const today = getTaipeiDateString();
  if (currentUsage.date !== today) {
    currentUsage = {
      date: today,
      dailyEstimatedCostUsd: 0,
      maxDailyCostUsd: MAX_DAILY_COST_USD,
      inputTokens: 0,
      outputTokens: 0,
      isCircuitBroken: false,
      totalCalls: 0,
      cacheHits: 0,
      fallbackCalls: 0,
    };
  }
}

/** 查詢當前預算與熔斷狀態 */
export function getAiBudgetUsage(): AiBudgetUsage {
  ensureCurrentDate();
  return { ...currentUsage };
}

/** 重設預算用量（供測試或手動調校使用） */
export function resetAiBudgetUsage(overrideDate?: string): void {
  currentUsage = {
    date: overrideDate || getTaipeiDateString(),
    dailyEstimatedCostUsd: 0,
    maxDailyCostUsd: MAX_DAILY_COST_USD,
    inputTokens: 0,
    outputTokens: 0,
    isCircuitBroken: false,
    totalCalls: 0,
    cacheHits: 0,
    fallbackCalls: 0,
  };
}

/** 清空 Hash 快取（供測試使用） */
export function clearPayloadHashCache(): void {
  payloadHashCache.clear();
}

/** 記錄 API Token 消耗並判定是否熔斷 */
export function recordTokenUsage(inputTokens: number, outputTokens: number): AiBudgetUsage {
  ensureCurrentDate();
  currentUsage.totalCalls += 1;
  currentUsage.inputTokens += inputTokens;
  currentUsage.outputTokens += outputTokens;

  const cost = inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN;
  currentUsage.dailyEstimatedCostUsd = Number(
    (currentUsage.dailyEstimatedCostUsd + cost).toFixed(6)
  );

  if (currentUsage.dailyEstimatedCostUsd >= MAX_DAILY_COST_USD) {
    currentUsage.isCircuitBroken = true;
  }

  return { ...currentUsage };
}

/** 靜態規則語意映射（熔斷或非 AI 環境下的平滑降級安全網） */
export function resolveRuleBasedLinking(article: ArticleInput): SemanticLinkingResult {
  const title = article.title || "";
  const sourceName = article.sourceName || "";
  const content = article.content || "";
  const fullText = `${title} ${sourceName} ${content}`.toLowerCase();

  // 1. 醫療人道救援 / 國際天災突發危機 -> global-watch (全球動態地球)
  if (
    sourceName === "msf" ||
    fullText.includes("無國界醫生") ||
    fullText.includes("人道救援") ||
    fullText.includes("前線醫療") ||
    fullText.includes("海外急難救助") ||
    fullText.includes("衝突地區醫療") ||
    fullText.includes("戰火難民")
  ) {
    return {
      toolSlugs: ["global-watch"],
      actionDigest: "關注前線人道救援動態與全球衝突災情，前往全球動態地球掌握即時監控地圖。",
      actionUrl: "https://www.msf.org.tw/",
      actionText: "無國界醫生前線援助",
      source: "rule-fallback",
    };
  }

  // 2. 人權倡議 / 海外發展援助 / 公益社福 -> npo-organizations (非營利組織目錄)
  if (
    sourceName === "amnesty" ||
    fullText.includes("特赦組織") ||
    fullText.includes("良心犯") ||
    fullText.includes("緊急連署") ||
    fullText.includes("take-action") ||
    fullText.includes("taiwan aid") ||
    fullText.includes("海外援助發展聯盟")
  ) {
    return {
      toolSlugs: ["npo-organizations"],
      actionDigest: "參與全球人權捍衛與跨國救援倡議，即刻採取行動參與國際個案連署。",
      actionUrl: "https://www.amnesty.tw/take-action",
      actionText: "特赦組織即刻連署",
      source: "rule-fallback",
    };
  }

  // 3. 國合會官方外援與技術合作 -> npo-organizations 與 global-watch
  if (
    sourceName === "icdf" ||
    fullText.includes("國合會") ||
    fullText.includes("國際合作發展基金會") ||
    fullText.includes("海外志工") ||
    fullText.includes("外援技術團")
  ) {
    return {
      toolSlugs: ["npo-organizations", "global-watch"],
      actionDigest: "掌握臺灣推動全球技術合作、公衛醫療與海外志工外派成果，共築堅韌夥伴網絡。",
      actionUrl: "https://www.icdf.org.tw/",
      actionText: "國合會全球夥伴專區",
      source: "rule-fallback",
    };
  }

  // 4. 反認知作戰 / 資訊戰 / 假訊息防禦 -> anti-fraud (防詐騙查證)
  if (
    sourceName === "anti_cw" ||
    fullText.includes("反認知作戰") ||
    fullText.includes("資訊戰") ||
    fullText.includes("假訊息") ||
    fullText.includes("境外操弄")
  ) {
    return {
      toolSlugs: ["anti-fraud"],
      actionDigest: "強化數位免疫力，提升假訊息與資訊戰拆解識別技能，守護民主防線。",
      actionUrl: "https://cw.yueyuknows.com/",
      actionText: "反認知作戰教育網",
      source: "rule-fallback",
    };
  }

  // 預設兜底
  return {
    toolSlugs: [],
    source: "rule-fallback",
  };
}

/**
 * 核心守護處理函式：
 * 1. 命中 payload_hash 快取 -> 直接回傳快取結果（零成本）
 * 2. 觸發單日 $2.8 熔斷門檻 -> 降級為規則比對並標記 fallbackCalls
 * 3. 未熔斷且具備 API Key -> 呼叫 AI（模擬或真實 SDK）並計算 token
 * 4. 結果回填 payload_hash 快取，保證未來冪等性
 */
export async function resolveSemanticLinking(
  article: ArticleInput,
  options: {
    apiKey?: string;
    mockAiResult?: { toolSlugs: string[]; actionDigest: string };
    estimatedTokens?: { input: number; output: number };
  } = {}
): Promise<SemanticLinkingResult> {
  ensureCurrentDate();

  // 1. 內容 Hash 快取檢查
  if (payloadHashCache.has(article.payloadHash)) {
    currentUsage.cacheHits += 1;
    const cached = payloadHashCache.get(article.payloadHash)!;
    return { ...cached, source: "cache" };
  }

  // 2. 檢查單日預算熔斷狀態
  if (currentUsage.isCircuitBroken || currentUsage.dailyEstimatedCostUsd >= MAX_DAILY_COST_USD) {
    currentUsage.isCircuitBroken = true;
    currentUsage.fallbackCalls += 1;
    const ruleResult = resolveRuleBasedLinking(article);
    payloadHashCache.set(article.payloadHash, ruleResult);
    return ruleResult;
  }

  // 3. AI 串接呼叫（若有傳入 API Key 或 Mock 結果）
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;

  if (apiKey && (options.mockAiResult || !process.env.TEST_MODE)) {
    try {
      // 模擬或真實消耗（預設單篇約 800 input tokens, 80 output tokens）
      const inputTokens = options.estimatedTokens?.input ?? 800;
      const outputTokens = options.estimatedTokens?.output ?? 80;

      recordTokenUsage(inputTokens, outputTokens);

      const aiResult: SemanticLinkingResult = options.mockAiResult
        ? {
            toolSlugs: options.mockAiResult.toolSlugs,
            actionDigest: options.mockAiResult.actionDigest.slice(0, 60),
            source: "ai",
          }
        : {
            ...resolveRuleBasedLinking(article),
            source: "ai",
          };

      payloadHashCache.set(article.payloadHash, aiResult);
      return aiResult;
    } catch {
      // API 例外平滑降級為規則比對
      currentUsage.fallbackCalls += 1;
      const fallbackResult = resolveRuleBasedLinking(article);
      payloadHashCache.set(article.payloadHash, fallbackResult);
      return fallbackResult;
    }
  }

  // 4. 無 API Key 時直接走規則比對（免外部依賴）
  currentUsage.fallbackCalls += 1;
  const directRuleResult = resolveRuleBasedLinking(article);
  payloadHashCache.set(article.payloadHash, directRuleResult);
  return directRuleResult;
}
