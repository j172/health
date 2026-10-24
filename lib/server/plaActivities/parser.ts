export interface PlaBulletinRawInput {
  title?: string;
  content: string;
  activityDate?: string; // YYYY-MM-DD
  imageUrl?: string | null;
  sourceUrl?: string;
}

export interface ParsedPlaBulletin {
  activityDate: string; // YYYY-MM-DD
  periodStart: string | null; // "YYYY-MM-DD HH:mm:ss"
  periodEnd: string | null;   // "YYYY-MM-DD HH:mm:ss"
  title: string;
  aircraftTotal: number;
  aircraftCrossed: number;
  vesselsTotal: number;
  officialShipsTotal: number;
  description: string;
  aircraftDetails: string | null;
  imageUrl: string | null;
  sourceUrl: string;
}

/**
 * Strips HTML tags and normalizes whitespace in announcement text.
 */
export function cleanBulletinText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Formats 4-digit military time (e.g. "0600") to "HH:mm:ss".
 */
function formatMilitaryTime(milTime: string): string {
  if (milTime.length === 4) {
    return `${milTime.slice(0, 2)}:${milTime.slice(2, 4)}:00`;
  }
  return "06:00:00";
}

/**
 * Extracts Gregorian date (YYYY-MM-DD) from title or text.
 * Handles ROC calendar years (e.g. 民國115年 -> 2026).
 */
export function extractActivityDate(title?: string, content?: string): string | null {
  const combined = `${title ?? ""} ${content ?? ""}`;

  // 1. Explicit ROC date with 民國 prefix: 民國\s*(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日
  const rocExplicitMatch = combined.match(/民國\s*(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (rocExplicitMatch) {
    const rocYear = parseInt(rocExplicitMatch[1], 10);
    const year = rocYear + 1911;
    const month = String(parseInt(rocExplicitMatch[2], 10)).padStart(2, "0");
    const day = String(parseInt(rocExplicitMatch[3], 10)).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // 2. Standard 4-digit Gregorian date: YYYY年MM月DD日 or YYYY-MM-DD or YYYY/MM/DD
  const gregMatch = combined.match(/(?:^|[^\d])(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/);
  if (gregMatch) {
    const year = gregMatch[1];
    const month = String(parseInt(gregMatch[2], 10)).padStart(2, "0");
    const day = String(parseInt(gregMatch[3], 10)).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // 3. Fallback ROC date without 民國 prefix (2 or 3 digits year followed by 年月日)
  const rocFallbackMatch = combined.match(/(?:^|[^\d])(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (rocFallbackMatch) {
    const rocYear = parseInt(rocFallbackMatch[1], 10);
    const year = rocYear + 1911;
    const month = String(parseInt(rocFallbackMatch[2], 10)).padStart(2, "0");
    const day = String(parseInt(rocFallbackMatch[3], 10)).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Parses raw PLA bulletin content and metadata into structured bulletin data.
 */
export function parsePlaBulletin(input: PlaBulletinRawInput): ParsedPlaBulletin {
  const cleanContent = cleanBulletinText(input.content || "");
  const cleanTitle = cleanBulletinText(input.title || "");

  // 1. Resolve activity date
  let resolvedDate = input.activityDate;
  if (!resolvedDate) {
    resolvedDate = extractActivityDate(cleanTitle, cleanContent) ?? new Date().toISOString().slice(0, 10);
  }

  // 2. Parse aircraft total
  // "偵獲共機 22 架次" or "共機 22 架次"
  let aircraftTotal = 0;
  const aircraftTotalMatch = cleanContent.match(/(?:偵獲)?共機\s*([0-9]+)\s*架次/);
  if (aircraftTotalMatch) {
    aircraftTotal = parseInt(aircraftTotalMatch[1], 10);
  }

  // 3. Parse crossed median line / airspace
  // "其中逾越海峽中線進入北部、西南及東部空域 15 架次" or "逾越海峽中線 15 架次"
  let aircraftCrossed = 0;
  let aircraftDetails: string | null = null;
  const crossedMatch = cleanContent.match(/其中逾越(?:海峽)?中線[^0-9]*([0-9]+)\s*架次/);
  if (crossedMatch) {
    aircraftCrossed = parseInt(crossedMatch[1], 10);
  } else {
    const altCrossed = cleanContent.match(/逾越(?:海峽)?中線[^0-9]*([0-9]+)\s*架次/);
    if (altCrossed) {
      aircraftCrossed = parseInt(altCrossed[1], 10);
    }
  }

  // Detailed aircraft crossing description (e.g. text in parentheses)
  const detailsMatch = cleanContent.match(/[（(]其中(逾越[^）)]+架次)[）)]/);
  if (detailsMatch) {
    aircraftDetails = detailsMatch[1].trim();
  } else if (aircraftCrossed > 0) {
    const generalDetails = cleanContent.match(/(逾越(?:海峽)?中線[^、，。]*架次)/);
    if (generalDetails) {
      aircraftDetails = generalDetails[1].trim();
    }
  }

  // 4. Parse naval vessels
  // "共艦 7 艘次" or "共艦 7 艘"
  let vesselsTotal = 0;
  const vesselsMatch = cleanContent.match(/共艦\s*([0-9]+)\s*艘(?:次)?/);
  if (vesselsMatch) {
    vesselsTotal = parseInt(vesselsMatch[1], 10);
  }

  // 5. Parse official ships (coast guard, etc.)
  // "公務船 1 艘" or "公務船 1 艘次"
  let officialShipsTotal = 0;
  const officialShipsMatch = cleanContent.match(/公務船\s*([0-9]+)\s*艘(?:次)?/);
  if (officialShipsMatch) {
    officialShipsTotal = parseInt(officialShipsMatch[1], 10);
  }

  // 6. Parse time period (start and end)
  let periodStart: string | null = null;
  let periodEnd: string | null = null;

  // Case A: Full dates in period
  // "自10月23日0600時至10月24日0600時止" or "自昨（23）日0600時至今日0600時止"
  const relativePeriodMatch = cleanContent.match(
    /自昨[（(]?([0-9]+)[）)]?日\s*([0-9]{4})時至今[（(]?([0-9]+)?[）)]?日\s*([0-9]{4})時/
  );
  if (relativePeriodMatch && resolvedDate) {
    const startHourMin = formatMilitaryTime(relativePeriodMatch[2]);
    const endHourMin = formatMilitaryTime(relativePeriodMatch[4]);
    
    const [y, m, d] = resolvedDate.split("-").map(Number);
    const endObj = new Date(Date.UTC(y, m - 1, d));
    const startObj = new Date(Date.UTC(y, m - 1, d));
    startObj.setUTCDate(startObj.getUTCDate() - 1);

    periodStart = `${startObj.toISOString().slice(0, 10)} ${startHourMin}`;
    periodEnd = `${endObj.toISOString().slice(0, 10)} ${endHourMin}`;
  } else {
    // Check explicit month/day match: 自(\d{1,2})月(\d{1,2})日(\d{4})時至(\d{1,2})月(\d{1,2})日(\d{4})時
    const explicitDateMatch = cleanContent.match(
      /自\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*([0-9]{4})時至\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*([0-9]{4})時/
    );
    if (explicitDateMatch && resolvedDate) {
      const year = resolvedDate.slice(0, 4);
      const startM = String(parseInt(explicitDateMatch[1], 10)).padStart(2, "0");
      const startD = String(parseInt(explicitDateMatch[2], 10)).padStart(2, "0");
      const startTime = formatMilitaryTime(explicitDateMatch[3]);
      const endM = String(parseInt(explicitDateMatch[4], 10)).padStart(2, "0");
      const endD = String(parseInt(explicitDateMatch[5], 10)).padStart(2, "0");
      const endTime = formatMilitaryTime(explicitDateMatch[6]);

      periodStart = `${year}-${startM}-${startD} ${startTime}`;
      periodEnd = `${year}-${endM}-${endD} ${endTime}`;
    } else if (resolvedDate) {
      // Default to standard 24-hr period: yesterday 06:00:00 to today 06:00:00
      const [y, m, d] = resolvedDate.split("-").map(Number);
      const startObj = new Date(Date.UTC(y, m - 1, d));
      startObj.setUTCDate(startObj.getUTCDate() - 1);
      periodStart = `${startObj.toISOString().slice(0, 10)} 06:00:00`;
      periodEnd = `${resolvedDate} 06:00:00`;
    }
  }

  // 7. Resolve default title if empty
  const defaultTitle = cleanTitle || `中共解放軍臺海周邊海、空域動態（${resolvedDate}）`;

  return {
    activityDate: resolvedDate,
    periodStart,
    periodEnd,
    title: defaultTitle,
    aircraftTotal,
    aircraftCrossed,
    vesselsTotal,
    officialShipsTotal,
    description: cleanContent,
    aircraftDetails,
    imageUrl: input.imageUrl ?? null,
    sourceUrl: input.sourceUrl || "https://www.mnd.gov.tw/news/plaactlist",
  };
}
