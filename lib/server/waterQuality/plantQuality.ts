/**
 * data.gov.tw 6308「水質資訊」— 台灣自來水公司各淨水場（給水系統）的出水水質
 * 檢驗結果 (issue #676, Track B B-14).
 *
 * Live shape, verified 2026-10-15 from
 * https://www.water.gov.tw/opendata/new_opendata_waterquality.csv: UTF-8 with a
 * BOM, 64.6 KB, a WIDE table — 154 plants × 72 columns:
 *
 *   row 1  區,系,項次,1,2,…,68,<blank>                  item numbers
 *   row 2  處,統,檢驗項目,<68 item names>,水質合格否(Y/N)
 *   row 3  別,代,飲用水水質標準,<68 standards>,－－
 *   row 4  <blank>,號,單位,<68 units>,－－
 *   rows   一區,'0101,新山淨水場(Sinshan)基隆市麥金路720號[0162030]{0101}<基隆市@Keelung City>,150,ND,…,Y
 *   footer 更新日期：2026/09/23  /  備註：  /  <one note about 台水's supply area>
 *
 * (The issue text says three header rows; the file has four. The parser does not
 * count rows — it finds the header rows by their labels in column 3 and a plant
 * row by its `[code]{office}` name cell, so it survives either layout.)
 *
 * Things the real file does that shaped this parser:
 * - Values are `ND`, `<1`, `<5`, `－－` or a number written with its own
 *   precision (`0.30`). All of them are kept as the original string: a value
 *   like `ND` has no honest numeric form, and `0.30` vs `0.3` is information.
 * - The 區處代碼 column carries a leading single quote (`'0101`); it is stripped.
 * - The `[0747044]` plant code is shared by two plants in four places (e.g. 六龜
 *   `{0709}` and 新威 `{0710}`) and three codes contain letters or a dash
 *   (`0363011A3`, `0561028-2`) — the identity of a plant is (區處代碼, plant
 *   code), not the code alone.
 * - The `<基隆市@Keelung City>` label is the file's own 縣市 label (merged ones
 *   exist: `新竹縣市`, `嘉義縣市`, `臺中縣市`, `臺南縣市`); it is kept as written,
 *   its English half dropped, and never inferred from the address.
 * - The in-file 「更新日期：2026/09/23」 is the data date (data.gov.tw's catalogue
 *   `modifiedDate` says 2025-11-14 for the same file).
 *
 * www.water.gov.tw is already used by the live 停水公告 pipeline, so it is treated
 * as reachable from the production host (spec §3).
 */
import { httpGetText } from "@/lib/server/net/httpClient";
import { tokenizeWraCsv } from "@/lib/server/water/wraCsvParser";
import type {
  PlantQualityPass,
  WaterPlantQualityItem,
  WaterPlantQualityRow,
} from "@/lib/server/waterQuality/plantQualityLookup";

export const WATER_PLANT_QUALITY_SOURCE_URL = "https://www.water.gov.tw/opendata/new_opendata_waterquality.csv";
export const WATER_PLANT_QUALITY_FEED_CODE = "water-plant-quality-6308";

/** Column 3 labels that identify the header rows (the cells above/below them are not needed). */
const ITEM_NAME_ROW_LABEL = "檢驗項目";
const STANDARD_ROW_LABEL = "飲用水水質標準";
const UNIT_ROW_LABEL = "單位";
const PASS_COLUMN_PREFIX = "水質合格否";

/** Column index of the combined plant cell (區處名稱, 區處代碼, <plant cell>, …items). */
const PLANT_CELL_INDEX = 2;
const FIRST_ITEM_INDEX = 3;

/**
 * `新山淨水場(Sinshan)基隆市麥金路720號[0162030]{0101}<基隆市@Keelung City>`
 * → name, English name, address, plant code, 區處代碼, service-area label.
 * The `<…>` part is optional so a file that drops it still parses.
 */
const PLANT_CELL_PATTERN = /^(.*?)\(([^()]*)\)(.*?)\[([^\]\s]+)\]\{(\d+)\}(?:<([^@>]*)(?:@[^>]*)?>)?$/;

/** The file quotes some cells with a leading apostrophe (Excel's text marker): `'0101`. */
const stripLeadingQuote = (cell: string): string => cell.trim().replace(/^'+/, "").trim();

const UPDATE_DATE_PATTERN = /更新日期\s*[：:]\s*(\d{4})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})/;

const toIsoDate = (year: string, month: string, day: string): string | null => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

export interface WaterPlantQualityParse {
  plants: WaterPlantQualityRow[];
  /** The footer's 「更新日期：YYYY/MM/DD」 as YYYY-MM-DD; null when the file carries none. */
  sourceUpdatedOn: string | null;
}

const toQualityPass = (cell: string): PlantQualityPass | null => {
  const flag = stripLeadingQuote(cell).toUpperCase();
  return flag === "Y" || flag === "N" ? flag : null;
};

/**
 * Parses the wide CSV into one row per plant. Skips the header rows and the
 * footer notes, reads the file's own update date from the footer, and keeps
 * every test value as the original string. Returns no plants for text that is
 * not the expected file at all (an HTML error page, a header-less CSV) — callers
 * treat that as a failed fetch.
 */
export const parseWaterPlantQuality = (text: string): WaterPlantQualityParse => {
  const rows = tokenizeWraCsv(text)
    .map((cells) => cells.map((cell) => cell.trim()))
    .filter((cells) => cells.some((cell) => cell !== ""));

  let sourceUpdatedOn: string | null = null;
  for (const cells of rows) {
    const match = UPDATE_DATE_PATTERN.exec(cells.find((cell) => cell !== "") ?? "");
    if (match) {
      sourceUpdatedOn = toIsoDate(match[1], match[2], match[3]);
      break;
    }
  }

  const nameRowIndex = rows.findIndex((cells) => cells[PLANT_CELL_INDEX] === ITEM_NAME_ROW_LABEL);
  if (nameRowIndex < 0) return { plants: [], sourceUpdatedOn };

  const nameRow = rows[nameRowIndex];
  const labelledRowAfter = (label: string): string[] =>
    rows.slice(nameRowIndex + 1).find((cells) => cells[PLANT_CELL_INDEX] === label) ?? [];
  const standardRow = labelledRowAfter(STANDARD_ROW_LABEL);
  const unitRow = labelledRowAfter(UNIT_ROW_LABEL);

  // Every named column after the three identifier columns is a test item, except
  // the Y/N column, which is the plant-level flag.
  let passColumn = -1;
  const itemColumns: { column: number; name: string; standard: string; unit: string }[] = [];
  for (let column = FIRST_ITEM_INDEX; column < nameRow.length; column++) {
    const name = stripLeadingQuote(nameRow[column]);
    if (!name) continue;
    if (name.startsWith(PASS_COLUMN_PREFIX)) {
      passColumn = column;
      continue;
    }
    itemColumns.push({
      column,
      name,
      standard: stripLeadingQuote(standardRow[column] ?? ""),
      unit: stripLeadingQuote(unitRow[column] ?? ""),
    });
  }
  if (itemColumns.length === 0) return { plants: [], sourceUpdatedOn };

  // A row shorter than this was cut off mid-line; storing it would put a partial result set on the page.
  const requiredWidth = Math.max(itemColumns[itemColumns.length - 1].column, passColumn) + 1;

  const byKey = new Map<string, WaterPlantQualityRow>();
  for (const cells of rows.slice(nameRowIndex + 1)) {
    const plantCell = PLANT_CELL_PATTERN.exec(cells[PLANT_CELL_INDEX] ?? "");
    if (!plantCell || cells.length < requiredWidth) continue;

    const [, plantName, plantNameEn, address, plantCode, officeCode, serviceArea] = plantCell;
    const items: WaterPlantQualityItem[] = itemColumns.map(({ column, name, standard, unit }) => ({
      name,
      standard,
      unit,
      value: stripLeadingQuote(cells[column] ?? ""),
    }));

    byKey.set(`${officeCode}:${plantCode}`, {
      officeName: stripLeadingQuote(cells[0] ?? ""),
      officeCode,
      plantCode,
      plantName: plantName.trim(),
      plantNameEn: plantNameEn.trim(),
      address: address.trim(),
      serviceArea: (serviceArea ?? "").trim(),
      qualityPass: passColumn >= 0 ? toQualityPass(cells[passColumn] ?? "") : null,
      items,
    });
  }

  return { plants: [...byKey.values()], sourceUpdatedOn };
};

/**
 * Downloads and parses the current file. Throws (rather than returning an empty
 * list) on a non-2xx status or when no plant rows came back, so the sync records
 * an ingest error and leaves the table untouched.
 */
export const fetchWaterPlantQuality = async (): Promise<WaterPlantQualityParse> => {
  const { status, text } = await httpGetText(WATER_PLANT_QUALITY_SOURCE_URL, {
    timeoutMs: 30_000,
    // The real file is ~65 KB; anything near this cap is not the file we expect.
    maxResponseBytes: 4 * 1024 * 1024,
    headers: { Accept: "text/csv, text/plain, */*" },
  });

  if (status < 200 || status >= 300) {
    throw new Error(`Water plant quality CSV (data.gov.tw 6308) download failed with status ${status}`);
  }

  const parsed = parseWaterPlantQuality(text);
  if (parsed.plants.length === 0) {
    throw new Error("Water plant quality CSV (data.gov.tw 6308) contained no parseable plant rows");
  }
  return parsed;
};
