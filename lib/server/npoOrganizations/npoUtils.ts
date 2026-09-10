import * as cheerio from "cheerio";

/**
 * Normalizes an organization name for deduplication and fuzzy comparison.
 * Strips corporate/legal form prefixes (社團法人, 財團法人, 台灣, 中華民國),
 * full/half width punctuation, and whitespace.
 */
export function normalizeOrgName(name: string): string {
  if (!name) return "";
  let clean = name.trim();
  // Strip common legal prefixes and prefixes with national identifiers
  clean = clean
    .replace(/^(社團法人|財團法人|社團|財團)/g, "")
    .replace(/^(中華民國|台灣省|臺灣省|台灣|臺灣|台北市|臺北市|新北市|高雄市|台中市|臺中市|台南市|臺南市|桃園市)/g, "")
    .replace(/^(社團法人|財團法人)/g, "");

  // Remove parentheses, brackets, and their contents (e.g. （公辦）, （原住民）, (附設), etc.)
  clean = clean.replace(/[（\(][^）\)]*[）\)]/g, "");
  // Remove all non-alphanumeric/CJK characters and whitespace
  clean = clean.replace(/[\s\-_—·・，,。.：:;；()（）\[\]【】「」『』]/g, "");
  return clean.toLowerCase();
}

/**
 * Validates and cleans a website URL.
 * Rejects invalid strings such as "無", "暫無", "無提供", "同上", "#", etc.
 */
export function cleanWebsiteUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed.length < 4 ||
    /^(無|暫無|無網站|暫無網站|同上|無提供|尚無|未知|none|null|nil|n\/a|na|#)$/i.test(trimmed) ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("mailto:")
  ) {
    return null;
  }

  let normalized = trimmed;
  if (
    normalized.includes(".aspx") ||
    normalized.includes("npo.org.tw") ||
    normalized.includes("localhost")
  ) {
    return null;
  }

  // If user entered only domain (e.g. www.example.org or fb.com/xyz)
  if (!/^https?:\/\//i.test(normalized)) {
    if (normalized.includes(".") && !normalized.includes(" ")) {
      normalized = `https://${normalized}`;
    } else {
      return null;
    }
  }

  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (!parsed.hostname.includes(".")) return null;
    if (parsed.pathname.includes(".aspx")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export interface ParsedNpoDetail {
  orgid: string;
  name: string;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  contact: string | null;
  president: string | null;
  founder: string | null;
  establishDate: string | null;
  permissionAuthority: string | null;
  orgAttribute: string | null;
  purpose: string | null;
  workFocus: string | null;
  serviceArea: string | null;
  serviceItems: string | null;
}

/**
 * Extracts structured fields from the HTML of an NPO Center detail page
 * (e.g. https://www.npo.org.tw/orgnpointroduction.aspx?tid=200&orgid=XXXX)
 */
export function extractNpoDetailFields(html: string, orgid: string): ParsedNpoDetail {
  const $ = cheerio.load(html);
  const text = $("body").text();

  const getField = (label: string): string | null => {
    // Look for matching elements containing the label
    let found: string | null = null;
    $("tr, div, li, p, span").each((_, el) => {
      if (found) return;
      const t = $(el).text().replace(/[ \t]+/g, " ").trim();
      const regex = new RegExp(`^${label}[：:\\s]+(.+)$`, "m");
      const match = t.match(regex);
      if (match && match[1]) {
        const val = match[1].trim();
        // Ignore container texts that are too long
        if (val.length > 0 && val.length < 500) {
          found = val;
        }
      }
    });
    if (found) return found;

    // Fallback search across line-breaks in text
    const regex = new RegExp(`${label}[：:\\s]+([^\\r\\n]+)`, "i");
    const m = text.match(regex);
    if (m && m[1]) {
      const v = m[1].replace(/[ \t]+/g, " ").trim();
      if (v.length > 0 && v.length < 300) return v;
    }
    return null;
  };

  const name =
    getField("機構名稱") ||
    $("h1, h2, h3, .title, .org-title")
      .first()
      .text()
      .trim() ||
    `NPO-${orgid}`;

  const phone = getField("電話") || getField("聯絡電話");
  const fax = getField("傳真");
  const email = getField("電子郵件") || getField("Email");

  // Website can be in text after 網址： or in an external <a> tag
  let website: string | null = null;
  const webMatch = text.match(/網址[：:\s]+(https?:\/\/[^\s\r\n<"']+)/i);
  if (webMatch && webMatch[1]) {
    website = cleanWebsiteUrl(webMatch[1]);
  }

  if (!website) {
    $("tr, div, li, p").each((_, el) => {
      if (website) return;
      const t = $(el).text().replace(/[ \t]+/g, " ").trim();
      if (t.includes("網址")) {
        $(el).find("a").each((_, a) => {
          if (website) return;
          const href = $(a).attr("href");
          if (
            href &&
            !href.includes("npo.org.tw") &&
            !href.includes("npotw") &&
            !href.includes("npois_tw") &&
            !href.includes(".aspx")
          ) {
            website = cleanWebsiteUrl(href);
          }
        });
        if (!website) {
          const raw = getField("網址");
          website = cleanWebsiteUrl(raw);
        }
      }
    });
  }

  const address = getField("地址");
  const contact = getField("聯絡人");
  const president = getField("執行長") || getField("理事長") || getField("董事長");
  const founder = getField("創辦人");
  const establishDate = getField("成立日期");
  const permissionAuthority = getField("許可機關");
  const orgAttribute = getField("機構屬性");
  const purpose = getField("成立主旨");
  const workFocus = getField("工作重點");
  const serviceArea = getField("服務區域");
  const serviceItems = getField("服務項目");

  // Infer city from address (e.g. 811高雄市楠梓區 -> 高雄市)
  let city: string | null = null;
  if (address) {
    const cityMatch = address.match(/(臺北市|台北市|新北市|基隆市|桃園市|新竹市|新竹縣|苗栗縣|臺中市|台中市|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|臺南市|台南市|高雄市|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)/);
    if (cityMatch) {
      city = cityMatch[1].replace("台", "臺");
    }
  }

  return {
    orgid,
    name,
    phone,
    fax,
    email,
    website,
    address,
    city,
    contact,
    president,
    founder,
    establishDate,
    permissionAuthority,
    orgAttribute,
    purpose,
    workFocus,
    serviceArea,
    serviceItems,
  };
}

export interface NpoListItem {
  orgid: string;
  orgCode: string;
  orgAttribute: string;
  name: string;
  serviceArea: string;
}

export function parseListPage(html: string): { items: NpoListItem[]; totalPages: number } {
  const $ = cheerio.load(html);
  const items: NpoListItem[] = [];

  $("table tr").each((_, el) => {
    const onclick = $(el).attr("onclick") || "";
    const match = onclick.match(/orgid=(\d+)/);
    if (!match) return;

    const orgid = match[1];
    const tds = $(el).find("td");
    if (tds.length < 4) return;

    const orgCode = $(tds[0]).text().trim();
    const orgAttribute = $(tds[1]).text().trim();
    const name = $(tds[2]).text().trim();
    const serviceArea = $(tds[3]).text().trim();

    items.push({
      orgid,
      orgCode,
      orgAttribute,
      name,
      serviceArea,
    });
  });

  let totalPages = 1;
  $("a[href*='nowPage']").each((_, a) => {
    const href = $(a).attr("href") || "";
    const m = href.match(/nowPage=(\d+)/);
    if (m) {
      const p = Number(m[1]);
      if (p > totalPages) totalPages = p;
    }
  });

  return { items, totalPages };
}
