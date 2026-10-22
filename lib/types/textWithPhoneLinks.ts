/**
 * Shared shape for narrative copy that may embed a real contact phone
 * number (e.g. "撥打 1957 福利諮詢專線申請") and needs that number to render
 * as a clickable `tel:` link, while the rest of the sentence stays plain
 * text. Also covers the rarer case of an SMS-only reporting line (e.g.
 * "0911-511-110") that must render as `sms:`, never `tel:`, since it can't
 * be dialed as a voice call — see `SmsLinkSegment` below, added for the
 * 聽語障人士 SMS-reporting-line mention in lib/server/tools/catalog.ts,
 * mirroring the `sms:` convention PR #783 established in
 * EmergencyHotlinesContent.tsx.
 *
 * Design intent (issue: "narrative text embeds phone numbers, make them
 * clickable"): most strings in this codebase's `steps`/FAQ/content arrays
 * never mention a phone number at all, so forcing every item in an array
 * to become a segment array would be a large, needless rewrite. Instead,
 * a field keeps its plain `string` type when it has no phone number, and
 * only becomes a `TextSegment[]` when it actually contains one — hence the
 * `TextWithPhoneLinks = string | TextSegment[]` union. A field whose type
 * was `string[]` becomes `TextWithPhoneLinks[]`; a field that was a scalar
 * `string` becomes `TextWithPhoneLinks`.
 *
 * Render with the matching component, `components/Common/TextWithPhoneLinks.tsx`.
 */

/** A plain-text run with no link. */
export interface PlainTextSegment {
  text: string;
}

/** A run that should render as a clickable `tel:` link. */
export interface PhoneLinkSegment {
  /**
   * Digits (and `#` extension separators, if ever needed) passed verbatim
   * into `` `tel:${tel}` `` — same convention already used site-wide for a
   * literal/known-constant phone number (e.g. `href="tel:1910"`,
   * `href="tel:165"`) rather than digits derived from a data field.
   */
  tel: string;
  /** Display text for the link — usually identical to `tel`, but can keep a human-readable dashed form (e.g. "0800-770-885") while `tel` holds the same digits-only or dash-included value actually dialed. */
  text: string;
}

/**
 * A run that should render as a clickable `sms:` link — for an SMS-only
 * reporting line (e.g. the deaf/speech-impaired 0911-511-110/119 lines),
 * which is not reachable as a voice call, so a `tel:` link would be
 * actively wrong. Kept as its own segment kind (not a flag on
 * `PhoneLinkSegment`) so `isPhoneLinkSegment`/`isSmsLinkSegment` stay
 * simple, mutually-exclusive type guards.
 */
export interface SmsLinkSegment {
  /** Digits passed verbatim into `` `sms:${sms}` ``, same convention as `PhoneLinkSegment.tel`. */
  sms: string;
  /** Display text for the link — usually a human-readable dashed form (e.g. "0911-511-110"). */
  text: string;
}

export type TextSegment = PlainTextSegment | PhoneLinkSegment | SmsLinkSegment;

/** A piece of narrative copy: a plain string, or — only when it embeds a phone/SMS number — an ordered array of segments covering the whole sentence. */
export type TextWithPhoneLinks = string | TextSegment[];

export function isPhoneLinkSegment(segment: TextSegment): segment is PhoneLinkSegment {
  return typeof (segment as PhoneLinkSegment).tel === "string";
}

export function isSmsLinkSegment(segment: TextSegment): segment is SmsLinkSegment {
  return typeof (segment as SmsLinkSegment).sms === "string";
}

/**
 * Flattens a `TextWithPhoneLinks` value back to plain text — e.g. for a
 * structural test asserting no wording was lost by the segment rewrite, or
 * for a context (meta description, JSON-LD, search index) that needs plain
 * text only, never JSX.
 */
export function plainTextOf(value: TextWithPhoneLinks): string {
  if (typeof value === "string") return value;
  return value.map((segment) => segment.text).join("");
}
