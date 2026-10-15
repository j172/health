/**
 * Pure helpers shared by the garbage-route parsers (lib/server/garbageRoutes)
 * and the route list UI (app/(zh)/tools/cleaning-squads) — issue #674 / B-16.
 * No server-only imports on purpose: the client bundle uses this file too.
 */

/** Weekday labels indexed like `Date#getDay()` — bit N of a day mask is weekday N (0 = Sunday). */
export const WEEKDAY_BITS = ["日", "一", "二", "三", "四", "五", "六"] as const;

/** `flags[0]` is Sunday … `flags[6]` is Saturday. */
export function weekdayMaskFromFlags(flags: readonly boolean[]): number {
  let mask = 0;
  for (let i = 0; i < WEEKDAY_BITS.length; i++) {
    if (flags[i]) mask |= 1 << i;
  }
  return mask;
}

/** Weekday indexes (0 = Sunday) set in `mask`, ascending. */
export function weekdaysFromMask(mask: number): number[] {
  const days: number[] = [];
  for (let i = 0; i < WEEKDAY_BITS.length; i++) {
    if (mask & (1 << i)) days.push(i);
  }
  return days;
}

/**
 * Human label for a stored weekday mask. `null` = the source dataset carries no
 * weekday information (Taipei's 136515), which is different from `0` = the
 * source says this kind of collection does not run on this route.
 */
export function formatWeekdays(mask: number | null): string | null {
  if (mask === null) return null;
  if (mask === 0) return "未排定";
  if (mask === 127) return "每日";
  return weekdaysFromMask(mask)
    .map((day) => `週${WEEKDAY_BITS[day]}`)
    .join("、");
}

/**
 * Normalizes the two source time shapes — Taipei's compact `HHMM` ("1630") and
 * New Taipei's `H:MM` ("12:40") — to zero-padded `HH:MM`. Hours up to 29 are
 * accepted: Taipei's late trips run past midnight and are written as 2417
 * rather than 0017, and dropping those would lose real stops. Anything else
 * returns null (a missing time must never fail a whole sync).
 */
export function normalizeClock(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  let hours: number;
  let minutes: number;

  const colon = /^(\d{1,2}):(\d{2})$/.exec(text);
  const compact = /^(\d{3,4})$/.exec(text);
  if (colon) {
    hours = Number(colon[1]);
    minutes = Number(colon[2]);
  } else if (compact) {
    const digits = compact[1].padStart(4, "0");
    hours = Number(digits.slice(0, 2));
    minutes = Number(digits.slice(2));
  } else {
    return null;
  }

  if (minutes > 59 || hours > 29) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Display form of a stored clock string; hour >= 24 is shown as the next day so readers do not misread "24:17". */
export function formatClock(clock: string | null | undefined): string {
  if (!clock) return "—";
  const match = /^(\d{2}):(\d{2})$/.exec(clock);
  if (!match) return clock;
  const hours = Number(match[1]);
  if (hours >= 24) return `次日 ${String(hours - 24).padStart(2, "0")}:${match[2]}`;
  return clock;
}
