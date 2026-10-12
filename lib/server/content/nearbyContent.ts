import type { LlmsPageContent, LlmsPageLink, LlmsPageSection } from "./llmsPage";
import { NEARBY_DEFAULT_TYPES, NEARBY_MORE_TYPES } from "@/lib/server/nearby/registry";

/**
 * Single source of truth for "/nearby"'s static description (issue #466
 * acceptance criterion 5: llms.txt + full-page Markdown). Unlike the
 * tool/privacy/accessibility pages #444 originally wired up, this page's own
 * on-screen *results* are per-visitor (they depend on live geolocation, which
 * cannot run inside a crawler-facing static response) — so this adapter
 * describes the feature and lists its 8 default + N "更多類型" data sources,
 * reusing the exact same NearbyTypeDef entries (label/emoji/description)
 * app/nearby/page.tsx's client component renders from, rather than a second,
 * independently maintained copy of that list.
 */

export const NEARBY_SUMMARY =
  "「我附近」頁面只需定位一次，就能同時看到 AED、診所、藥局、公廁、涼適點、無障礙ATM、急診即時壅塞、避難所這 8 類急用點位各自最近的 3 筆結果與距離，並可展開查看更多設施類型。";

function describeTypes(label: string, defs: typeof NEARBY_DEFAULT_TYPES): LlmsPageSection {
  return {
    heading: label,
    paragraphs: defs.map((def) => `- **${def.emoji} ${def.label}**：${def.description}`),
  };
}

/** Builds the shared `LlmsPageContent` shape for `/nearby`, sourced from the same NearbyTypeDef registry the page itself renders from. */
export function buildNearbyLlmsPageContent(baseUrl: string): LlmsPageContent {
  const url = `${baseUrl}/nearby`;

  const sources: LlmsPageLink[] = [...NEARBY_DEFAULT_TYPES, ...NEARBY_MORE_TYPES].map((def) => ({
    title: `${def.emoji} ${def.label}`,
    url: def.toolSlug ? `${baseUrl}/tools/${def.toolSlug}` : undefined,
    note: def.description,
  }));

  return {
    title: "我附近：一次定位看全部急用點位",
    url,
    summary: NEARBY_SUMMARY,
    sources,
    sections: [
      {
        heading: "功能說明",
        paragraphs: [
          "開啟頁面後，瀏覽器會請求一次定位授權；定位成功後，頁面會同時查詢 8 類預設急用點位，每類只顯示最近的 3 筆並標示距離。任一類型的資料來源暫時查詢失敗，只會顯示該類型的錯誤狀態，其他類型仍正常顯示，不會互相影響。",
          "若您拒絕定位授權，或定位逾時、裝置不支援定位，頁面會明確提示並讓您改選縣市，不會靜默套用任何預設地點。",
          "展開「更多類型」可以從其他設施類型中逐一選擇、個別查詢，不會一次把全部類型都查一遍。",
        ],
      },
      describeTypes("8 類預設急用點位", NEARBY_DEFAULT_TYPES),
      describeTypes("更多類型（展開後逐類查詢）", NEARBY_MORE_TYPES),
    ],
    related: [
      { title: "全國公共場所 AED 急救地圖", url: `${baseUrl}/tools/aed` },
      { title: "全臺急救責任醫院急診即時看板", url: `${baseUrl}/tools/er-status` },
      { title: "防災與避難所地圖", url: `${baseUrl}/tools/disaster-map` },
    ],
  };
}
