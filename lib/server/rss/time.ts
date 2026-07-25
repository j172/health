export const parseRfc822ToDate = (value: unknown): Date | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const parseTaipeiDateToUtc = (value: unknown): Date | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);

  const utcMillis = Date.UTC(year, month - 1, day, hour - 8, minute, second);
  const parsed = new Date(utcMillis);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};