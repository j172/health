/**
 * 電話號碼清洗與 tel: 連結生成工具 (issue #803, #804)。
 */

/** 將全形數字與符號轉為半形字元 */
function normalizeFullWidth(str) {
  return str.replace(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
}

/**
 * 清洗電話號碼並生成符合 RFC 3966 標準的 `tel:` URI。
 * 
 * - 多支電話（以 `/`、`、`、`;` 分隔）取第一支主要代表號
 * - 濾除括號、空白、中文說明（如「轉」、「分機」等）
 * - 保留有效之數字與國際碼 `+`
 * - 若號碼長度少於 3 碼或無有效數字，回傳 null
 * 
 * @param {string | null | undefined} phone
 * @returns {string | null}
 */
export function cleanTelUri(phone) {
  if (!phone || typeof phone !== "string") return null;

  // 1. 全形轉半形並修剪空白
  let raw = normalizeFullWidth(phone).trim();
  if (!raw) return null;

  // 2. 多支電話取第一支
  const firstSegment = raw.split(/[/、;,]/)[0].trim();
  if (!firstSegment) return null;

  // 3. 切割分機或中文註記（如 "轉123"、"分機45"、"ext."、"#123"）
  const mainNumber = firstSegment.split(/(?:分機|轉|ext\.?|#)/i)[0].trim();
  if (!mainNumber) return null;

  // 4. 是否為國際碼開頭
  const isInternational = mainNumber.startsWith("+");

  // 5. 移除非數字字元
  const digits = mainNumber.replace(/\D/g, "");

  // 台灣電話最短為 3 碼緊急電話 (110, 119, 112, 113, 165 等)
  if (digits.length < 3) return null;

  return isInternational ? `tel:+${digits}` : `tel:${digits}`;
}

/**
 * 取得易讀的顯示電話文字（取第一支主號碼，修飾多餘空白）。
 * 
 * @param {string | null | undefined} phone
 * @returns {string | null}
 */
export function formatDisplayPhone(phone) {
  if (!phone || typeof phone !== "string") return null;

  const raw = normalizeFullWidth(phone).trim();
  if (!raw) return null;

  // 取第一支電話（含可能的分機）
  const first = raw.split(/[/、;]/)[0].trim();
  return first || null;
}
