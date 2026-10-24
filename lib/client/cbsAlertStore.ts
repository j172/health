"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ActiveCbsAlert } from "@/lib/server/disaster/cbsAlerts";

export interface CbsAlertStatus {
  hasActive: boolean;
  activeAlerts: ActiveCbsAlert[];
  lastUpdated?: string;
}

export const CBS_STATUS_URL = "/api/cbs-status";
const FRESH_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

const SIM_STORAGE_KEY = "cbsSim";
const SIM_PARAM = "cbs-sim";

let snapshot: CbsAlertStatus | null = null;
let lastFetchedAt = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

const readSimulation = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get(SIM_PARAM);
    if (fromUrl === "off" || fromUrl === "none") {
      window.sessionStorage.removeItem(SIM_STORAGE_KEY);
    } else if (fromUrl === "active") {
      window.sessionStorage.setItem(SIM_STORAGE_KEY, fromUrl);
    }
    return window.sessionStorage.getItem(SIM_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const parseCbsStatus = (data: unknown): CbsAlertStatus => {
  if (!data || typeof data !== "object") {
    return { hasActive: false, activeAlerts: [] };
  }

  const record = data as Record<string, unknown>;
  const activeAlertsRaw = Array.isArray(record.activeAlerts) ? record.activeAlerts : [];

  const parsedAlerts: ActiveCbsAlert[] = [];
  for (const item of activeAlertsRaw) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    const headline = typeof a.headline === "string" ? a.headline.trim() : "";
    const description = typeof a.description === "string" ? a.description.trim() : "";
    const event = typeof a.event === "string" ? a.event.trim() : headline;
    const expires = typeof a.expires === "string" ? a.expires : "";

    const severityStr = String(a.severity || "");
    const severity =
      severityStr === "Extreme" || severityStr === "Severe" || severityStr === "Moderate"
        ? severityStr
        : "Severe";

    const areas = Array.isArray(a.areas) ? a.areas.filter((x): x is string => typeof x === "string") : [];

    parsedAlerts.push({
      id: String(a.id || `cbs-${Date.now()}`),
      headline,
      description,
      event,
      severity,
      effective: typeof a.effective === "string" ? a.effective : new Date().toISOString(),
      expires,
      areas,
      web: typeof a.web === "string" ? a.web : undefined,
    });
  }

  const hasActive = Boolean(record.hasActive && parsedAlerts.length > 0);

  return {
    hasActive,
    activeAlerts: parsedAlerts,
    lastUpdated: typeof record.lastUpdated === "string" ? record.lastUpdated : undefined,
  };
};

const doFetch = async (): Promise<void> => {
  const sim = readSimulation();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = sim ? `${CBS_STATUS_URL}?sim=${sim}` : CBS_STATUS_URL;
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-cache",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();
    snapshot = parseCbsStatus(json);
  } catch {
    // On fetch/parse failure, do not display or clear current alert
    snapshot = null;
  } finally {
    clearTimeout(timer);
    lastFetchedAt = Date.now();
    emit();
  }
};

/**
 * Refreshes CBS status. Cached for 60 seconds unless forced.
 * Never rejects.
 */
export const refreshCbsAlertStatus = (force = false): Promise<void> => {
  if (inFlight) return inFlight;
  if (!force && lastFetchedAt > 0 && Date.now() - lastFetchedAt < FRESH_MS) {
    return Promise.resolve();
  }
  inFlight = doFetch().finally(() => {
    inFlight = null;
  });
  return inFlight;
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getCbsAlertStatusSnapshot = (): CbsAlertStatus | null => snapshot;
const getServerSnapshot = (): CbsAlertStatus | null => null;

/**
 * Client hook for CBS emergency alerts.
 * Mirrors `useTyphoonStatus` and `useEarthquakeStatus`.
 */
export function useCbsAlertStatus(pollIntervalMs = FRESH_MS): CbsAlertStatus | null {
  const currentSnapshot = useSyncExternalStore(subscribe, getCbsAlertStatusSnapshot, getServerSnapshot);

  useEffect(() => {
    void refreshCbsAlertStatus();
    if (pollIntervalMs > 0) {
      const timer = setInterval(() => {
        void refreshCbsAlertStatus(true);
      }, pollIntervalMs);
      return () => clearInterval(timer);
    }
  }, [pollIntervalMs]);

  return currentSnapshot;
}

/** Whether the banner is path-excluded (e.g., admin pages). */
export const isCbsBannerExcludedPath = (pathname: string | null | undefined): boolean => {
  if (!pathname) return false;
  const clean = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  return clean === "/admin" || clean.startsWith("/admin/") || clean.startsWith("/embed/");
};

/** Determines whether the banner should render given current status. */
export const shouldShowCbsBanner = (status: CbsAlertStatus | null | undefined): boolean => {
  return Boolean(status && status.hasActive && status.activeAlerts && status.activeAlerts.length > 0);
};

/** Reset store internal state (strictly for tests). */
export const __resetCbsAlertStatusStoreForTests = (): void => {
  snapshot = null;
  lastFetchedAt = 0;
  inFlight = null;
  listeners.clear();
};
