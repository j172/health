import fs from "node:fs/promises";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const SEED_OUTPUT_PATH = path.join(REPO_ROOT, "data", "medical-violators-seed.json");

const agent = new https.Agent({ rejectUnauthorized: false });

export const CATEGORIES = [
  { code: "A", name: "醫師", hasSpecialty: true },
  { code: "B", name: "中醫師", hasSpecialty: false },
  { code: "C", name: "牙醫師", hasSpecialty: false },
  { code: "D,E", name: "藥事人員", hasSpecialty: false },
  { code: "F,G", name: "醫事檢驗人員", hasSpecialty: false },
  { code: "H,I,J,K", name: "護理人員", hasSpecialty: false },
  { code: "L,M", name: "助產人員", hasSpecialty: false },
  { code: "Z", name: "營養師", hasSpecialty: false },
  { code: "Q,U", name: "物理治療人員", hasSpecialty: false },
  { code: "S,T", name: "醫事放射人員", hasSpecialty: false },
  { code: "R,W", name: "職能治療人員", hasSpecialty: false },
  { code: "Y", name: "臨床心理師", hasSpecialty: false },
  { code: "X", name: "諮商心理師", hasSpecialty: false },
  { code: "V", name: "呼吸治療師", hasSpecialty: false },
  { code: "1", name: "語言治療師", hasSpecialty: false },
  { code: "3", name: "聽力師", hasSpecialty: false },
  { code: "2,4", name: "牙體技術人員", hasSpecialty: false },
  { code: "5,6", name: "驗光人員", hasSpecialty: false },
];

function decodeHtmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function resolveCaseUrl(rawUrl, baseUrl = "https://ma.mohw.gov.tw/Accessibility/VIOSearch/") {
  if (!rawUrl) return "";
  let clean = decodeHtmlEntities(rawUrl).trim();
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    return clean;
  }
  try {
    const resolved = new URL(clean, baseUrl);
    return resolved.href;
  } catch {
    return clean;
  }
}

function cleanCellText(cellHtml) {
  return decodeHtmlEntities(cellHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

export function parseCategoryHtml(postHtml, cat) {
  const records = [];
  const trMatches = [...postHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];

  for (const tr of trMatches) {
    const rowHtml = tr[1];
    if (rowHtml.includes("<th")) continue;

    const tdMatches = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (tdMatches.length === 0) continue;

    let name = "";
    let specialty = "";
    let city = "";
    let caseHtml = "";
    let licenseMasked = "";

    if (cat.hasSpecialty && tdMatches.length >= 5) {
      name = cleanCellText(tdMatches[0][1]);
      specialty = cleanCellText(tdMatches[1][1]);
      city = cleanCellText(tdMatches[2][1]);
      caseHtml = tdMatches[3][1];
      licenseMasked = cleanCellText(tdMatches[4][1]);
    } else if (tdMatches.length >= 4) {
      name = cleanCellText(tdMatches[0][1]);
      specialty = "";
      city = cleanCellText(tdMatches[1][1]);
      caseHtml = tdMatches[2][1];
      licenseMasked = cleanCellText(tdMatches[3][1]);
    } else {
      continue;
    }

    if (!name) continue;

    // Extract links
    const linkMatches = [...caseHtml.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const links = linkMatches.map((l) => {
      const rawHref = l[1];
      const linkText = decodeHtmlEntities(l[2].replace(/<[^>]+>/g, "").trim());
      const fullUrl = resolveCaseUrl(rawHref);
      const isJudgment = fullUrl.includes("judgment.judicial.gov.tw");
      const isDisciplinary = fullUrl.includes(".pdf") || fullUrl.includes("gazette");

      return {
        title: linkText || (isJudgment ? "裁判書" : "處分書"),
        url: fullUrl,
        type: isJudgment ? "judgment" : isDisciplinary ? "disciplinary" : "other",
      };
    });

    const dispositionText = cleanCellText(caseHtml);

    let status = "執業中";
    if (city === "已廢證" || specialty === "已廢證") {
      status = "已廢證";
    } else if (city === "歇業" || specialty === "歇業") {
      status = "歇業";
    }

    records.push({
      id: `${cat.code}-${name}-${licenseMasked}`,
      name,
      category: cat.name,
      categoryCode: cat.code,
      specialty: specialty || (status === "已廢證" ? "已廢證" : status === "歇業" ? "未載明" : "未登錄專科"),
      city: city || "未載明",
      status,
      licenseMasked,
      disposition: dispositionText,
      links,
    });
  }

  return records;
}

export async function fetchAllViolators() {
  const formUrl = "https://ma.mohw.gov.tw/Accessibility/VIOSearch/MASearchVIO";
  console.log(`[sync-medical-violators] 連線至衛福部專區: ${formUrl}`);

  const getRes = await fetch(formUrl, { agent });
  if (!getRes.ok) {
    throw new Error(`無法存取專區首頁，HTTP 狀態碼: ${getRes.status}`);
  }

  const getText = await getRes.text();
  const cookies = getRes.headers.getSetCookie ? getRes.headers.getSetCookie() : [getRes.headers.get("set-cookie")];
  const cookieHeader = (cookies || []).map((c) => c.split(";")[0]).join("; ");

  const tokenMatch = getText.match(/name="__RequestVerificationToken" type="hidden" value="([^"]+)"/);
  const codeMatch = getText.match(/data-code="([^"]+)"/);

  if (!tokenMatch || !codeMatch) {
    throw new Error("無法解析 CSRF Token 或驗證碼 (data-code)");
  }

  const token = tokenMatch[1];
  const captcha = codeMatch[1];
  console.log(`[sync-medical-violators] 成功取得 Token 與驗證碼: ${captcha}`);

  const postUrl = "https://ma.mohw.gov.tw/Accessibility/VIOSearch/VIODataList";
  const allRecords = [];

  for (const cat of CATEGORIES) {
    const params = new URLSearchParams();
    params.append("__RequestVerificationToken", token);
    params.append("CER_REF_ID", cat.code);
    params.append("txtVCode", captcha);

    try {
      const postRes = await fetch(postUrl, {
        method: "POST",
        headers: {
          Cookie: cookieHeader,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        body: params.toString(),
        agent,
      });

      if (!postRes.ok) {
        console.warn(`[sync-medical-violators] 類別 ${cat.name} 查詢失敗 (HTTP ${postRes.status})`);
        continue;
      }

      const postHtml = await postRes.text();
      const records = parseCategoryHtml(postHtml, cat);
      if (records.length > 0) {
        console.log(`[sync-medical-violators] 類別 ${cat.name} 解析出 ${records.length} 筆案件`);
        allRecords.push(...records);
      }
    } catch (err) {
      console.error(`[sync-medical-violators] 類別 ${cat.name} 查詢例外:`, err.message);
    }
  }

  return allRecords;
}

async function main() {
  const records = await fetchAllViolators();
  console.log(`[sync-medical-violators] 共擷取到 ${records.length} 筆醫事違法人員紀錄`);

  const payload = {
    metadata: {
      source: "衛生福利部 醫事人員性別事件資訊專區",
      sourceUrl: "https://ma.mohw.gov.tw/Accessibility/VIOSearch/MASearchVIO",
      lastSyncedAt: new Date().toISOString(),
      totalCount: records.length,
      note: "依據個人資料保護法第16條但書第2款，公開資訊僅供公眾就醫安全公益查驗。",
    },
    data: records,
  };

  await fs.writeFile(SEED_OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`[sync-medical-violators] 成功寫入種子檔: ${SEED_OUTPUT_PATH}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[sync-medical-violators] 執行失敗:", err);
    process.exit(1);
  });
}
