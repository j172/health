import { STOP_DOMAINS } from "./stopDomains";

/**
 * One row from `fraud_domains` that matched a candidate host. `siteNature`
 * and `reportedYearMonth` are the raw upstream values (網站性質 / 民國年月)
 * for the *specific* source that produced this hit — a domain flagged by
 * more than one source (issue #567 will add 165027/160055 alongside this
 * ticket's 176455) shows up as one `DomainHit` per source, not merged.
 */
export interface DomainHit {
  domain: string;
  source: string;
  siteNature: string | null;
  reportedYearMonth: string | null;
}

export type CheckSuspiciousUrlStatus = "matched" | "not-listed" | "invalid";

export interface CheckSuspiciousUrlResult {
  status: CheckSuspiciousUrlStatus;
  normalizedHost: string | null;
  hits: DomainHit[];
}

/**
 * Looks up every candidate host in whatever store backs the fraud-domain
 * list. Injected so this module never touches the DB (or anything else)
 * itself — production wires in a real query (lib/server/antiFraud/queries.ts),
 * tests wire in a fake. Must resolve to the hits for *any* of the candidates
 * passed in, in any order; checkSuspiciousUrl does not care which candidate
 * each hit came from beyond what's already in `DomainHit.domain`.
 */
export type FindDomainsFn = (candidates: string[]) => Promise<DomainHit[]>;

// A hostname label (the text between dots) in ASCII form — after
// `URL.hostname` has already lower-cased it and, for non-ASCII input,
// converted it to punycode (e.g. "詐騙.tw" -> "xn--912aw42a.tw"). Matches
// the standard "letters/digits, hyphens only in the middle" hostname label
// grammar; an empty label (from something like "a..b.com") fails this.
const HOST_LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Normalizes arbitrary user input into a bare, comparable hostname, or
 * `null` if the input isn't a URL/domain at all. Used both by
 * `checkSuspiciousUrl` (on the pasted query) and by the 176455 ingestion
 * parser (on each upstream CSV row) — the two sides must agree on exactly
 * one canonical spelling per domain for `findDomains`'s exact-match lookup
 * to ever hit.
 *
 * Steps: trim; add a `http://` scheme if the input didn't already have
 * one (so bare domains like "example.com" parse the same as full URLs);
 * parse with `URL` (which lower-cases the host and IDNA/punycode-encodes
 * non-ASCII domains for us — confirmed: `new URL("http://詐騙.tw").hostname
 * === "xn--912aw42a.tw"`); strip the port (not part of `.hostname`) and any
 * trailing dot(s); then validate the result actually looks like a domain.
 *
 * That last validation step matters more than it looks: `new URL("http://165")`
 * happily resolves to hostname `"0.0.0.165"` — WHATWG's host parser treats a
 * bare number as IPv4 shorthand. Left unchecked, a non-URL string like a
 * phone number would silently normalize to a fake IP and get queried as if
 * it were a real lookup, instead of being rejected as `invalid` the way
 * issue #564 requires. Real domain TLDs are never purely numeric (that's
 * exactly how IPv4 literals are told apart from names), so rejecting a
 * numeric last label doubles as the IPv4-literal rejection too — this tool
 * only ever deals in domains, not bare IPs.
 */
export function normalizeHost(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
  const withScheme = hasScheme ? trimmed : `http://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (!host) return null;

  const labels = host.split(".");
  if (labels.length < 2) return null; // no TLD-like suffix at all (e.g. "localhost")
  if (labels.some((label) => !HOST_LABEL_RE.test(label))) return null;

  const tld = labels[labels.length - 1];
  if (/^[0-9]+$/.test(tld)) return null; // IPv4-shorthand misparse, or a literal IP — see doc comment above

  return host;
}

/**
 * Builds the ordered list of candidate hosts to look up for a normalized
 * host, from most to least specific: the full host itself, then each
 * shorter parent obtained by dropping one leading label at a time — e.g.
 * `a.b.example.com` -> `["a.b.example.com", "b.example.com", "example.com"]`
 * — so a scam site's subdomain (`login.scam-example.com`) still surfaces a
 * hit when it's the *registrable* domain (`scam-example.com`) that was
 * reported, not the exact subdomain (user story #8).
 *
 * Climbing stops the moment the *next* candidate up would be a public
 * suffix or a shared platform domain (STOP_DOMAINS) — that candidate is
 * never added, and nothing shorter than it is tried either. This is what
 * keeps a report against one tenant's subdomain (confirmed live in the real
 * 176455 data: rows like `u0pmj3-kv.myshopify.com` and
 * `funny-daffodil-cd1f66.netlify.app`, each flagging one storefront) from
 * ever being able to match every other tenant on the same platform (user
 * story #9) — `myshopify.com`/`netlify.app` themselves are never generated
 * as candidates for a `*.myshopify.com`/`*.netlify.app` subdomain query.
 *
 * The full host is always included even when it IS itself a STOP_DOMAINS
 * entry (e.g. someone pastes the bare platform domain "myshopify.com") —
 * the stop list only prevents *climbing past* what the user actually
 * typed, not checking the literal thing they typed.
 */
export function buildCandidateHosts(host: string): string[] {
  const labels = host.split(".");
  const candidates = [labels.join(".")];

  for (let i = 1; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join(".");
    if (STOP_DOMAINS.has(candidate)) break;
    candidates.push(candidate);
  }

  return candidates;
}

/**
 * Checks whether a user-supplied URL/domain is on the fraud-domain list.
 * Pure aside from the injected `findDomains` call: no logging, no DB
 * access, no persistence of any kind — the privacy promise in issue #564 is
 * that nobody's pasted URL is ever recorded, and this function is the one
 * place that promise has to hold structurally, not just by convention.
 */
export async function checkSuspiciousUrl(
  input: string,
  findDomains: FindDomainsFn,
): Promise<CheckSuspiciousUrlResult> {
  const normalizedHost = normalizeHost(input);
  if (!normalizedHost) {
    return { status: "invalid", normalizedHost: null, hits: [] };
  }

  const candidates = buildCandidateHosts(normalizedHost);
  const hits = candidates.length > 0 ? await findDomains(candidates) : [];

  return {
    status: hits.length > 0 ? "matched" : "not-listed",
    normalizedHost,
    hits,
  };
}
