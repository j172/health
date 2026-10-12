# Spec & Ticket: News Static Map SVG & Image Resilience

- **Ticket ID**: `SPEC-HEALTH-20260821-IMG-SVG-RESILIENCE`
- **Status**: IN PROGRESS
- **Priority**: HIGH (P1)
- **Affects**: News Card Thumbnail (`components/News/CardThumb.tsx`), Article Hero Image (`components/News/HeroImage.tsx`), Static Map Generator (`lib/server/news/staticMap.ts`), Next.js Config (`next.config.js`), Database Schema (`lib/server/db/mysql.ts`).

---

## 1. Problem Statement & Root Cause

### Symptom
When a news article is assigned a static map SVG (e.g. `/uploads/maps/map_741432_22.6273_120.3014.svg`), the rendered DOM output is:
```html
<img alt="..." loading="lazy" decoding="async" data-nimg="fill" class="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] transition-opacity duration-300 ease-out opacity-0" src="/uploads/maps/map_741432_22.6273_120.3014.svg" style="position: absolute; height: 100%; width: 100%; inset: 0px;">
```
The image is permanently stuck in `opacity-0`, resulting in a completely blank card.

### Root Causes
1. **Next.js `<Image>` SVG Optimization Limitation**: `CardThumb.tsx` only bypassed Next.js Image Optimization for specific `/images/news/` subpaths. SVGs under `/uploads/maps/` were sent through Next.js Image Optimizer (`/_next/image`), which rejects SVGs by default for security, returning HTTP 400 Bad Request.
2. **Missing `onError` Fallback**: Because `CardThumb.tsx` and `HeroImage.tsx` had no `onError` listener, any HTTP error (400 or 404) left `loaded` as `false`, causing the image element to stay transparent (`opacity-0`) forever instead of gracefully degrading.
3. **Storage Path Inconsistency**: Static maps were written to `/public/uploads/maps/` instead of the canonical `/public/images/news/maps/` directory, missing the `max-age=31536000, immutable` caching rules defined in `next.config.js`.

---

## 2. Agreed Architectural Blueprint

### 2.1 Front-End Image Resilience
- **`CardThumb.tsx`**:
  - Add `hasError` state.
  - On `onError`, switch rendering immediately to the source-branded text/gradient placeholder (`getSourcePlaceholderStyle(item.source_name)`).
  - Explicitly mark all `.svg` files, `/images/news/`, and legacy `/uploads/maps/` as `unoptimized={true}`.
- **`HeroImage.tsx`**:
  - Add `hasError` state and `onError` handler to prevent perpetual `opacity-0` blanks on article detail pages.

### 2.2 Directory Normalization & Static Caching
- **`staticMap.ts`**:
  - Write new static map SVGs to `public/images/news/maps/`.
  - Output relative path as `/images/news/maps/${fileName}`.
  - Automatically create the destination directory recursively.

### 2.3 Next.js Configuration
- **`next.config.js`**:
  - Enable `dangerouslyAllowSVG: true` and strict `contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;"` within the `images` object for global SVG safety.

### 2.4 Database Migration & Backward Compatibility
- **`mysql.ts`**:
  - In `ensureSchema()`, execute an idempotent `UPDATE news_card_images SET local_path = REPLACE(local_path, '/uploads/maps/', '/images/news/maps/') WHERE local_path LIKE '/uploads/maps/%'`.
- Code handles both `/images/news/maps/` and legacy `/uploads/maps/` gracefully.

---

## 3. Acceptance & Verification Criteria
1. `npx tsc --noEmit` passes with 0 errors.
2. `npm run lint` passes with 0 errors.
3. `npm run build` compiles cleanly.
4. Git branch merged to `main` with a clean history and deployed/pushed.

---

## 4. Post-Deploy Follow-Up (found & patched 2026-08-21, same day)

Two gaps surfaced only after this spec's fix actually reached production:

1. **Merging to `main` does not deploy.** `deploy-ftps.yml` is `workflow_dispatch`-only. The fix commit (`3a5dbcc`) landed ~11 minutes *after* the last production deploy had already applied, so the live site kept serving the pre-fix `CardThumb.tsx` (no `onError`, no `unoptimized` for `/uploads/maps/`) until someone manually ran `gh workflow run deploy-ftps.yml`. The blank-card symptom this spec describes is fully reproducible any time a fix like this sits merged-but-undeployed.
2. **§2.4's DB migration rewrites `local_path` strings only — it never moves the physical file.** `UPDATE news_card_images SET local_path = REPLACE(...)` ran fine on deploy and repointed every `static_map` row from `/uploads/maps/…` to `/images/news/maps/…`, but the actual `.svg` files were still sitting under the old `public/uploads/maps/` directory (which the app's `MAP_IMAGES_DIR` no longer writes to). Result: every static-map row migrated straight into a 404 at its *new* path, with the (still-working) old file now orphaned and unreferenced by any row. `onError` masked this as a placeholder card instead of a blank one, so it didn't look broken — but the map itself never rendered.
   - **Manual remediation applied 2026-08-21**: all 6 legacy files under `public/uploads/maps/` on production were `cp`'d (not moved) into `public/images/news/maps/` via SSH, restoring every affected article's real map.
   - **Not yet fixed at the code level**: nothing prevents this from recurring for any *future* schema/path migration of `news_card_images`. A real fix should make the migration step itself copy/move the physical file alongside the `local_path` rewrite (or have `assignStaticMapImage`/the read path self-heal by regenerating when the referenced file is missing, since today's `INSERT ... WHERE NOT EXISTS` guard means a row with a lost file is never retried).
