/**
 * Decodes a Big5-encoded CSV buffer (common for older MOHW open-data
 * exports) to a UTF-8 string. Uses Node's built-in full-ICU `TextDecoder`
 * instead of `iconv-lite` — confirmed byte-for-byte identical to
 * iconv-lite's output on a real MOHW Big5 CSV sample (issue #479).
 */
export const decodeBig5 = (buffer: Buffer): string => new TextDecoder("big5").decode(buffer);

const CHAR_QUOTE = 34; // "
const CHAR_COMMA = 44; // ,
const CHAR_CR = 13; // \r
const CHAR_LF = 10; // \n
const CHAR_BOM = 0xfeff;

/** A row that is just empty/whitespace text (a blank line) is not data. */
const isBlankRow = (row: readonly string[]): boolean => row.length <= 1 && (row[0] ?? "").trim() === "";

/**
 * Incremental CSV tokenizer: yields one row (untrimmed cells) at a time, so a
 * caller can turn each row into its final shape and let the raw cells go
 * instead of holding every cell of the file at once. Blank lines are skipped.
 *
 * Operates on the whole text as one character stream, not line-split first —
 * some MOHW exports (e.g. the elder-welfare-institution dataset's 收容對象
 * column) embed literal newlines inside quoted fields (e.g. `"安養\n養護"`),
 * which a split-on-newline-first parser would corrupt by treating as two
 * separate rows. Handles quoted fields (with embedded commas and newlines) and
 * "" as an escaped quote; a stray `"` inside an unquoted cell toggles quoting
 * (the long-standing behaviour every source here was written against); `\r`
 * outside quotes is dropped and `\n` ends the row.
 *
 * Cells are cut out of the text with slice()/indexOf() rather than appended
 * character by character: it is several times faster and does not create one
 * throw-away string per character.
 */
export function* iterateCsvRows(text: string): Generator<string[], void, undefined> {
  const length = text.length;
  let i = text.charCodeAt(0) === CHAR_BOM ? 1 : 0;
  // Start of the run of ordinary characters not yet appended to `cell`.
  let runStart = i;
  let cell = "";
  let row: string[] = [];

  while (i < length) {
    const code = text.charCodeAt(i);

    if (code === CHAR_QUOTE) {
      cell += text.slice(runStart, i);
      i++;
      // Quoted section: copy up to the closing quote; `""` is a literal quote and stays quoted.
      for (;;) {
        const close = text.indexOf('"', i);
        if (close === -1) {
          cell += text.slice(i);
          i = length;
          break;
        }
        cell += text.slice(i, close);
        if (text.charCodeAt(close + 1) === CHAR_QUOTE) {
          cell += '"';
          i = close + 2;
        } else {
          i = close + 1;
          break;
        }
      }
      runStart = i;
    } else if (code === CHAR_COMMA) {
      cell += text.slice(runStart, i);
      row.push(cell);
      cell = "";
      i++;
      runStart = i;
    } else if (code === CHAR_LF) {
      cell += text.slice(runStart, i);
      row.push(cell);
      cell = "";
      i++;
      runStart = i;
      const finished = row;
      row = [];
      if (!isBlankRow(finished)) yield finished;
    } else if (code === CHAR_CR) {
      // skip — \n ends the row
      cell += text.slice(runStart, i);
      i++;
      runStart = i;
    } else {
      i++;
    }
  }

  cell += text.slice(runStart, length);
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (!isBlankRow(row)) yield row;
  }
}

/**
 * Parses a whole CSV text into header-keyed records (cells trimmed). See
 * iterateCsvRows for the dialect. Materialises every row — fine for the small
 * and medium sources; a source with tens of thousands of rows should iterate
 * with iterateCsvRows and build its own, leaner, per-row result instead.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = iterateCsvRows(text);
  const first = rows.next();
  if (first.done) return [];

  const headers = first.value.map((h) => h.trim());
  const records: Record<string, string>[] = [];
  for (const cells of rows) {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => (record[h] = (cells[i] ?? "").trim()));
    records.push(record);
  }
  return records;
}

/** TFDA/MOL/NHI datasets frequently use fullwidth digits (０-９) in addresses/phones. */
export const toHalfwidthDigits = (s: string): string => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));

/**
 * Collapses embedded line breaks and extra whitespace out of a unit/org name
 * — some county open-data CSV exports (confirmed live on New Taipei's
 * 125231/123786 early-intervention joint-assessment-center sources, issue
 * #613) wrap a long institution name across two lines inside one quoted CSV
 * cell (e.g. `"國泰醫療財團法人\n汐止國泰綜合醫院"`), which parseCsv's quoted-
 * field handling correctly preserves as a literal `\n` rather than silently
 * dropping. Used for the `sourceId`-bearing name itself (so the same real
 * institution doesn't get two different keys depending on whether upstream
 * happened to wrap the line that month) — intentionally collapses to no
 * space at all, not one, since Chinese org names never have meaningful
 * inter-character spaces of their own.
 */
export const normalizeUnitName = (raw: string): string => raw.replace(/\s+/g, "").trim();

/**
 * Some MOHW county/district-level sources already ship a complete address in
 * their 地址 column (county+district+street), but the ingest script also
 * prepends 縣市/鄉鎮市區 unconditionally (safe for the rows that need it,
 * wrong for the ones that already have it) or the source row itself has a
 * truncated county name that fools an "already has the prefix" check —
 * confirmed live: "新北市土城區新北市土城區中正路18號6樓" (clean double) and
 * "臺中市中市北屯區和平里..." (county truncated to "中市" in the source,
 * then a full "臺中市" prepended in front of it). Both are the same shape:
 * a short unit repeats back-to-back near the start. Detects the repeat and
 * drops the duplicate, keeping one copy either way.
 */
function dedupeAddressPrefix(address: string): string {
  // Exact whole-prefix doubling (county+district repeated in full).
  for (let len = 12; len >= 4; len--) {
    if (address.length >= len * 2 && address.slice(0, len) === address.slice(len, len * 2)) {
      return address.slice(len);
    }
  }
  // Shorter unit duplicated just past the start (truncated-source-data case).
  for (let len = 2; len <= 4; len++) {
    for (let start = 0; start <= 4; start++) {
      const unit = address.slice(start, start + len);
      if (unit.length === len && unit === address.slice(start + len, start + len * 2)) {
        return address.slice(0, start + len) + address.slice(start + len * 2);
      }
    }
  }
  return address;
}

/**
 * Cleans up a raw government-dataset address for geocoding (and display):
 *   - fullwidth digits → halfwidth
 *   - drop parenthetical annotations, e.g. "（代表）", "(1樓)", "（環境職業醫學部）"
 *   - keep only the first address when multiple full addresses are listed,
 *     separated by a full/half-width comma or "及" ("and" — e.g. "…路56號，
 *     成功路182-2號" or "復興街5號、5之7號及文化一路15號" — genuinely different
 *     streets). A 、 (Chinese enumeration comma) on its own is left alone,
 *     since that far more often just lists multiple house numbers on the
 *     *same* street (e.g. "八德路2段424、426號") — splitting on it would chop
 *     the "號" unit off the first number.
 *   - collapse a duplicated county/district prefix (see dedupeAddressPrefix)
 *   - collapse/trim whitespace
 */
export function normalizeAddress(raw: string): string {
  const halfwidth = toHalfwidthDigits(raw);
  const firstAddress = halfwidth.split(/[,，]|及/)[0];
  const withoutParens = firstAddress.replace(/[（(][^）)]*[）)]/g, "");
  const deduped = dedupeAddressPrefix(withoutParens.trim());
  return deduped.replace(/\s+/g, " ").trim();
}
