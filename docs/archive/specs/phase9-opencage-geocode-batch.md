# Feature Specification: Green-shop geocoding batch (Phase 9)

## Goal

Complete missing coordinates for `green_shop / moenv_green_shop` records with
a bounded, resumable GitHub Actions job. The job must protect the production
host, OpenCage free-trial quota, and Nominatim public service.

## Agreed policy

- Scope is green shops only; do not reset or process other facility sources.
- Run every 10 minutes, at most 10 facilities per invocation.
- OpenCage is attempted first at one request per second, with a daily budget
  of 1,400 requests. A provider-wide circuit breaker stops OpenCage for the
  current run/day on HTTP 402 (quota exceeded) or 429 (rate limited).
- After OpenCage is stopped for quota/rate reasons, use Nominatim at one
  request per second, with a daily budget of 1,000 requests. Stop the current
  day on Nominatim 429, timeout, or repeated zero-success batches.
- Google Maps is not enabled and must not be called when its key is absent.
- Before querying, normalize a copy of each address: normalize common
  Taiwan/臺灣 variants, whitespace and punctuation, strip parenthetical notes
  that interfere with lookup, and preserve the source address unchanged.
- Deduplicate exact normalized addresses within a batch/day so one successful
  result can be applied to all matching green-shop facilities.
- Accept coordinates only when the provider identifies Taiwan and the point
  falls inside the configured Taiwan bounding box; OpenCage results additionally
  require confidence >= 7. Invalid/low-confidence results fall through.
- Perform one controlled reset of `geocode_attempts` for green-shop rows that
  still have no coordinates after normalization. Thereafter each row gets at
  most three further attempts; never reset on every scheduled run.
- Keep the schedule permanently. A run with no pending rows exits without
  making provider requests.
- Write per-run counters to GitHub Actions Summary. Notify via workflow failure
  and the existing ntfy path on quota/rate exhaustion, repeated zero-success,
  timeout, or lock conflict.

## Required implementation

1. Add provider-aware geocoding outcomes and a global per-run circuit breaker;
   do not silently treat OpenCage quota exhaustion as an ordinary no-result.
2. Add a green-shop-only batch runner and an idempotent, one-time reset path.
3. Add the 10-minute scheduled workflow, using the existing SSH loopback tunnel
   and admin API; prevent overlapping runs with a real PID/flock lock.
4. Add tests or deterministic unit coverage for address normalization,
   provider fallback, quota/rate stop conditions, Taiwan/confidence validation,
   address deduplication, and no-op completion.

## Acceptance criteria

- No scheduled invocation can process more than 10 facilities or exceed the
  configured daily provider budgets.
- A 402/429/timeout causes a bounded stop and is visible in the run summary.
- Duplicate normalized addresses consume one lookup and update all matches.
- Invalid country, out-of-bounds, or low-confidence coordinates are not stored.
- Previously failed green shops are retried only by the one-time reset and then
  respect the three-attempt ceiling.
- `npx tsc --noEmit`, `npm run build`, and `npm run lint` pass for the change.
- The workflow is safe to rerun and leaves production healthy.
