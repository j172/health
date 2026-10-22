import { Fragment } from "react";
import { isPhoneLinkSegment, type TextWithPhoneLinks as TextWithPhoneLinksValue } from "@/lib/types/textWithPhoneLinks";

/**
 * Renders a `TextWithPhoneLinks` value (see lib/types/textWithPhoneLinks.ts):
 * a plain string renders as-is, and a segment array renders each plain-text
 * run as text and each phone-number run as a clickable `<a href="tel:...">`
 * link — matching this repo's existing `tel:` link convention (see
 * tests/tel-link-coverage.test.mjs) rather than inventing a new one.
 *
 * Deliberately returns inline content only (a React fragment), so it can be
 * dropped into an existing `<p>`/`<span>`/`<li>` without changing layout.
 */
export function TextWithPhoneLinks({
  value,
  linkClassName = "font-semibold underline",
}: {
  value: TextWithPhoneLinksValue;
  /** className applied to each rendered `<a href="tel:...">`. Defaults to a plain underline + bold so it reads as a link without assuming a surrounding text color. */
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
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}
