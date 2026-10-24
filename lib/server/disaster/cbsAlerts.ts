import { XMLParser } from "fast-xml-parser";
import { httpGetText } from "@/lib/server/net/httpClient";

export const CBS_ATOM_FEED_URL = "https://cbs.tw/files/rssatomfeed.xml";
const CBS_CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

export type CbsSeverity = "Extreme" | "Severe" | "Moderate";

export interface ActiveCbsAlert {
  id: string;
  headline: string;
  description: string;
  event: string;
  severity: CbsSeverity;
  effective: string;
  expires: string;
  areas: string[];
  web?: string;
}

export interface CbsStatusResponse {
  activeAlerts: ActiveCbsAlert[];
  hasActive: boolean;
}

interface CacheEntry {
  timestamp: number;
  alerts: ActiveCbsAlert[];
}

let serverCache: CacheEntry | null = null;

const toArray = <T>(val: T | T[] | undefined | null): T[] => {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
};

/**
 * Extracts and cleans areas from raw CAP area block or string.
 */
function extractAreaList(areaNode: unknown): string[] {
  const result = new Set<string>();
  const nodes = toArray(areaNode);

  for (const node of nodes) {
    if (!node) continue;
    let desc = "";
    if (typeof node === "string") {
      desc = node;
    } else if (typeof node === "object" && node !== null) {
      const record = node as Record<string, unknown>;
      desc = String(record.areaDesc || record["#text"] || "");
    }

    if (desc) {
      // Split on common Chinese/English area separators
      const parts = desc
        .split(/[、,，\n\r]+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      for (const p of parts) {
        result.add(p);
      }
    }
  }

  return Array.from(result);
}

/**
 * Pure parser for CBS ATOM Feed containing embedded CAP 1.2 XML.
 *
 * Spec requirements:
 * 1. Parses <status>, <msgType>, <scope>, <info> block.
 * 2. Checks <expires> timestamp: ignores any item where Date.now() > Date.parse(expires).
 * 3. Filters for alerts with <urgency> in ["Immediate", "Expected"] and <severity> in ["Extreme", "Severe", "Moderate"]
 *    (defaults to Extreme / Severe for PWS exclusivity).
 * 4. Gracefully handles malformed XML, empty feeds, missing tags.
 */
export function parseCbsFeedXml(xml: string, nowMs = Date.now()): ActiveCbsAlert[] {
  if (!xml || typeof xml !== "string" || !xml.trim()) {
    return [];
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    trimValues: true,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object") {
    return [];
  }

  // Find all <alert> nodes across either ATOM feed (<feed><entry><content><alert>>) or direct CAP (<alert>)
  const rawAlerts: Array<{ alertObj: Record<string, unknown>; fallbackId?: string; fallbackTitle?: string }> = [];

  if (parsed.alert) {
    for (const a of toArray(parsed.alert)) {
      if (typeof a === "object" && a !== null) {
        rawAlerts.push({ alertObj: a as Record<string, unknown> });
      }
    }
  } else if (parsed.feed && typeof parsed.feed === "object") {
    const feed = parsed.feed as Record<string, unknown>;
    const entries = toArray(feed.entry);

    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const entryObj = entry as Record<string, unknown>;
      const fallbackId = typeof entryObj.id === "string" ? entryObj.id : undefined;
      const fallbackTitle = typeof entryObj.title === "string" ? entryObj.title : undefined;

      // <alert> can be direct child of <entry> or inside <content>
      if (entryObj.alert) {
        for (const a of toArray(entryObj.alert)) {
          if (typeof a === "object" && a !== null) {
            rawAlerts.push({ alertObj: a as Record<string, unknown>, fallbackId, fallbackTitle });
          }
        }
      } else if (entryObj.content && typeof entryObj.content === "object") {
        const content = entryObj.content as Record<string, unknown>;
        if (content.alert) {
          for (const a of toArray(content.alert)) {
            if (typeof a === "object" && a !== null) {
              rawAlerts.push({ alertObj: a as Record<string, unknown>, fallbackId, fallbackTitle });
            }
          }
        }
      }
    }
  }

  const activeAlerts: ActiveCbsAlert[] = [];
  const seenIds = new Set<string>();

  for (const { alertObj, fallbackId, fallbackTitle } of rawAlerts) {
    const status = String(alertObj.status || "").trim();
    // Only Actual alerts in production PWS; reject Draft / System / Test
    if (status && status.toLowerCase() !== "actual") {
      continue;
    }

    const msgType = String(alertObj.msgType || "").trim();
    // Cancel messages withdraw earlier alerts
    if (msgType && msgType.toLowerCase() === "cancel") {
      continue;
    }

    const alertId = String(alertObj.identifier || fallbackId || `cbs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

    const infoList = toArray(alertObj.info);
    for (const rawInfo of infoList) {
      if (!rawInfo || typeof rawInfo !== "object") continue;
      const info = rawInfo as Record<string, unknown>;

      const urgency = String(info.urgency || "").trim();
      const severityRaw = String(info.severity || "").trim();

      // PWS urgency filter: Immediate or Expected
      const allowedUrgencies = ["immediate", "expected"];
      if (urgency && !allowedUrgencies.includes(urgency.toLowerCase())) {
        continue;
      }

      // Severity check: Extreme, Severe, or Moderate
      let normalizedSeverity: CbsSeverity;
      const sevLower = severityRaw.toLowerCase();
      if (sevLower === "extreme") {
        normalizedSeverity = "Extreme";
      } else if (sevLower === "severe") {
        normalizedSeverity = "Severe";
      } else if (sevLower === "moderate") {
        normalizedSeverity = "Moderate";
      } else {
        // Exclude Unknown / Minor from PWS emergency banner
        continue;
      }

      const expires = String(info.expires || "").trim();
      if (!expires) {
        continue;
      }
      const expiresMs = Date.parse(expires);
      if (!Number.isFinite(expiresMs) || nowMs > expiresMs) {
        // Expired alert
        continue;
      }

      const effective = String(info.effective || alertObj.sent || new Date(nowMs).toISOString());
      const headline = String(info.headline || alertObj.headline || fallbackTitle || info.event || "國家級重大告警").trim();
      const description = String(info.description || headline).trim();
      const event = String(info.event || headline).trim();
      const web = info.web ? String(info.web).trim() : undefined;
      const areas = extractAreaList(info.area);

      const alertKey = `${alertId}_${event}_${expires}`;
      if (seenIds.has(alertKey)) continue;
      seenIds.add(alertKey);

      activeAlerts.push({
        id: alertId,
        headline,
        description,
        event,
        severity: normalizedSeverity,
        effective,
        expires,
        areas,
        web,
      });
    }
  }

  // Sort by severity (Extreme first) then expires ascending
  const severityRank: Record<CbsSeverity, number> = {
    Extreme: 0,
    Severe: 1,
    Moderate: 2,
  };

  return activeAlerts.sort((a, b) => {
    const diff = severityRank[a.severity] - severityRank[b.severity];
    if (diff !== 0) return diff;
    return Date.parse(a.expires) - Date.parse(b.expires);
  });
}

/**
 * Fetches and returns active CBS emergency alerts with in-memory server caching.
 * Never throws — on network or parse failure, returns last valid cached data or empty array.
 */
export async function fetchActiveCbsAlerts(options: { force?: boolean } = {}): Promise<ActiveCbsAlert[]> {
  const now = Date.now();
  if (!options.force && serverCache && now - serverCache.timestamp < CBS_CACHE_TTL_MS) {
    // Filter out any alert that expired while in cache
    return serverCache.alerts.filter((alert) => Date.parse(alert.expires) > now);
  }

  try {
    const { status, text } = await httpGetText(CBS_ATOM_FEED_URL, {
      timeoutMs: FETCH_TIMEOUT_MS,
    });

    if (status >= 200 && status < 300 && text) {
      const alerts = parseCbsFeedXml(text, now);
      serverCache = {
        timestamp: now,
        alerts,
      };
      return alerts;
    }
  } catch (error) {
    // Upstream server down, timeout, or DNS issue
    console.error("[cbsAlerts] Failed to fetch CBS feed:", error);
  }

  if (serverCache) {
    return serverCache.alerts.filter((alert) => Date.parse(alert.expires) > now);
  }

  return [];
}

/** Resets server cache (strictly for unit testing). */
export function __resetCbsServerCacheForTests(): void {
  serverCache = null;
}
