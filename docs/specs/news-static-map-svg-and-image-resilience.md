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
