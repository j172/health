import { Fragment } from "react";
import {
  isPhoneLinkSegment,
  isSmsLinkSegment,
  type TextWithPhoneLinks as TextWithPhoneLinksValue,
} from "@/lib/types/textWithPhoneLinks";

/**
 * Renders a `TextWithPhoneLinks` value (see lib/types/textWithPhoneLinks.ts):
 * a plain string renders as-is, and a segment array renders each plain-text
 * run as text, each phone-number run as a clickable `<a href="tel:...">`
 * link, and each SMS-only-line run as a clickable `<a href="sms:...">` link
 * — matching this repo's existing `tel:`/`sms:` link conventions (see
 * tests/tel-link-coverage.test.mjs and tests/sms-link-hearing-impaired.test.mjs)
 * rather than inventing a new one.
 *
 * Deliberately returns inline content only (a React fragment), so it can be
 * dropped into an existing `<p>`/`<span>`/`<li>` without changing layout.
 */
export function TextWithPhoneLinks({
  value,
  linkClassName = "font-semibold underline",
}: {
  value: TextWithPhoneLinksValue;
  /** className applied to each rendered `<a href="tel:...">`/`<a href="sms:...">`. Defaults to a plain underline + bold so it reads as a link without assuming a surrounding text color. */
  linkClassName?: string;
}) {
  if (typeof value === "string") return <>{value}</>;

  return (
    <>
      {value.map((segment, index) =>
        isPhoneLinkSegment(segment) ? (
          <a key={index} href={`tel:${segment.tel}`} className={linkClassName}>
            {segment.text}
          </a>
        ) : isSmsLinkSegment(segment) ? (
          <a key={index} href={`sms:${segment.sms}`} className={linkClassName}>
            {segment.text}
          </a>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}
