// A synthetic stand-in for the live 新北市 125664 CSV, sized like the real one
// (measured 2026-10-15: 26,574 records, ~3.6 MB, 29 columns) so the memory /
// event-loop tests exercise the same volume without committing a 3.6 MB file.
// Shape copied from the real rows in __fixtures__/ntpc-125664-sample.csv: a BOM,
// the 29-column header, a quoted route name with a space now and then, quoted
// stop names that contain a newline, memos (one that is only a newline), and
// the 21 'Y' / empty weekday flags.
import { readFileSync } from "node:fs";

export const SYNTHETIC_NTPC_ROWS = 26_574;
export const SYNTHETIC_NTPC_LINES = 648;

const header = readFileSync(new URL("../__fixtures__/ntpc-125664-sample.csv", import.meta.url), "utf-8")
  .replace(/^﻿/, "")
  .split(/\r?\n/, 1)[0];

const DISTRICTS = ["萬里區", "金山區", "土城區", "三芝區", "板橋區", "中和區", "永和區", "新莊區", "三重區", "淡水區"];
// 21 weekday cells each: 一般垃圾 x 7, 資源回收 x 7, 廚餘 x 7 (Sunday first).
const flagCells = (...days) => {
  const cells = new Array(21).fill("");
  for (const day of days) cells[day] = "Y";
  return "," + cells.join(",");
};
const FLAG_PATTERNS = [
  flagCells(1, 2, 4, 5, 6, 8, 9, 11, 12, 13, 15, 16, 18, 19, 20), // Mon/Tue/Thu/Fri/Sat style
  flagCells(4, 11, 18), // Thursday only, all three kinds
  flagCells(1, 3, 5, 8, 10, 12, 15, 17, 19), // Mon/Wed/Fri style
];

/** The CSV text. `rows` records spread over `lines` routes; deterministic (no randomness). */
export function buildSyntheticNtpcCsv({ rows = SYNTHETIC_NTPC_ROWS, lines = SYNTHETIC_NTPC_LINES } = {}) {
  const out = ["﻿" + header];
  const perLine = Math.ceil(rows / lines);
  let emitted = 0;
  for (let line = 0; line < lines && emitted < rows; line++) {
    const district = DISTRICTS[line % DISTRICTS.length];
    const lineId = String(207000 + line);
    const lineName = line % 5 === 0 ? `"${district.slice(0, 2)}${line}路線 晚上${line % 3}"` : `${district.slice(0, 2)}${line}路線下午`;
    for (let rank = 1; rank <= perLine && emitted < rows; rank++, emitted++) {
      const road = `${district.slice(0, 2)}${(line * 7 + rank) % 97}路${rank % 6 + 1}段`;
      let stopName = `${road}${(rank * 13) % 400}號(${["海巡", "托兒所", "區公所", "社區活動中心"][rank % 4]})`;
      if (emitted % 2000 === 7) stopName = `"${road}${rank}號\n(路牌下收運後迴轉)"`;
      const memo = emitted % 997 === 3 ? "2025通報" : emitted % 1499 === 5 ? '"\n"' : "";
      const lng = (121.4 + ((emitted * 7919) % 30000) / 100000).toFixed(8);
      const lat = (24.95 + ((emitted * 104729) % 30000) / 100000).toFixed(8);
      const hour = String(12 + (rank % 8)).padStart(2, "0");
      const minute = String((rank * 7) % 60).padStart(2, "0");
      out.push(
        [district, lineId, lineName, rank, stopName, `${district.slice(0, 1)}${rank % 40}里`, lng, lat, `${hour}:${minute}`, memo].join(",") +
          FLAG_PATTERNS[emitted % FLAG_PATTERNS.length],
      );
    }
  }
  return out.join("\n") + "\n";
}
