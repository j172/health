# Feature Specification: News & Facility Geocoding & Image Backfill (文章補圖與補座標)

## 1. Goal

Enhance public health news articles (`news_items`) and health/welfare facilities (`facilities`) with structured geographic coordinates (`lat`, `lng`), identified location names, linked facilities, and rich visual cover images using a 3-tier fallback and dynamic static map cards.

## 2. Agreed Policy & Architecture

### 2.1 Geographic Coordinates & Hybrid Extraction
- **Scope**: Both `news_items` and `facilities`.
- **Hybrid Extraction Priority**:
  1. **Administrative Boundary / Landmark Match (Zero API Cost)**: Regex and dictionary matching for Taiwan's 22 counties/cities and 368 districts/townships with centroid coordinates.
  2. **Facility Database Match (Zero API Cost)**: Exact and substring matching against the local `facilities` table (hospitals, clinics, welfare centers, nursing homes) to link `facility_id` and existing `lat, lng`.
  3. **External Geocoding API Fallback**: For unrecognized specific addresses/locations, call OpenCage / Nominatim with daily request rate-limiting and circuit breaker protections (`geocode_provider_budget`).
- **Data Model**:
  - `news_items` additions:
    - `lat`: DECIMAL(10, 7) NULL
    - `lng`: DECIMAL(10, 7) NULL
    - `location_name`: VARCHAR(255) NULL
    - `facility_id`: BIGINT NULL (Foreign key to `facilities.id`, ON DELETE SET NULL)
    - Indexes on `(lat, lng)` and `(facility_id)`.

### 2.2 Image Backfill & Static Map Generation
- **3-Tier Image Fallback Pipeline**:
  1. **HTML & OG Image**: Extracted from source article HTML (`news_assets` or `og:image`).
  2. **Multi-Stock Provider Search**: Query Pixabay → Pexels → Unsplash fallback with keyword translation and rate-limit backoff.
  3. **Static Map Thumbnail Fallback**: For geocoded articles with no matching stock image, generate a clean OpenStreetMap / CartoDB static map tile image (`provider: 'static_map'`) saved locally under `public/uploads/maps/`.
- **Data Model**:
  - `news_card_images` adjustments:
    - `pixabay_id`: BIGINT NULLABLE (was NOT NULL)
    - `provider`: VARCHAR(30) NOT NULL DEFAULT 'pixabay' ('og_image', 'pixabay', 'pexels', 'unsplash', 'static_map')

### 2.3 Automation & Pipeline
- **Real-time Ingest**: On RSS feed sync (`/api/admin/rss-sync`), run real-time dictionary/facility name matching to instantly attach known coordinates to incoming articles.
- **Offline Batch Jobs**:
  - Batch geocoding API endpoint (`/api/admin/news-geocode-batch`) for background resolution of unlocated articles.
  - GitHub Actions batch runner (`scripts/gha-news-geo-image-backfill.mjs`) for scheduled overnight backfills.

### 2.4 Frontend UI / UX
- **News Detail Page (`app/news/[id]`)**:
  - Header / Metadata: Location Badge (e.g. `📍 台北市大安區 · 台大醫院`).
  - Interactive Map Card (`components/News/NewsMapCard.tsx`): Displays OpenStreetMap interactive pin, directions link, and direct link to the related healthcare facility.
- **News Card (`components/News/NewsCard.tsx`)**:
  - Displays location badge on the card.
  - Shows static map cover image when no stock image is assigned.

## 3. Acceptance Criteria
- `ensureSchema()` in `lib/server/db/schema.ts` safely creates/alters columns and indexes idempotently.
- Zero crashes/WASM memory leaks on the 768MB V8 heap server.
- All builds and checks pass: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Worktree clean commit history merged to `main`.
