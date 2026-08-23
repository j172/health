# Feature Specification: Home News Grid Blog Post Integration (24th Card Slot)

## 1. Overview & Objectives

This specification defines the server-side integration of the latest blog post from the publisher's primary weblog (`https://blog.j172.tw/feed/`) into the home page news grid of `j172tw Healthz` (https://health.j172.tw).

### Key Objectives
1. **Seamless Visual Parity**: Present the latest blog post using the identical `NewsCard` design language (title, publication date, reading time estimation, author attribution, and aspect-ratio 16:10 thumbnail).
2. **External Link Routing**: Automatically configure card navigation (thumbnail link, title link, and "閱讀全文 →" link) to open the destination article in a new tab (`target="_blank"` with `rel="noopener noreferrer"`).
3. **Responsive Grid Alignment**: Structure the "All" (`all`) category pool to consistently render **24 cards** (23 recent health news articles + 1 latest blog article), ensuring no trailing orphan cards on 3-column desktop layouts (8 complete rows) or 2-column tablet layouts (12 complete rows).
4. **Resilience & High Availability**: Implement server-side ISR caching with graceful degradation — if the external WordPress RSS feed is unreachable, the system automatically falls back to the 24th general news item without throwing errors or breaking the UI layout.

---

## 2. Technical Architecture & Data Ingestion Flow

```
┌──────────────────────────────────────────────────────────┐
│             StabloNewsLayout (Server Component)          │
└────────────────────────────┬─────────────────────────────┘
                             │ Parallel Promise.all
        ┌────────────────────┴────────────────────┐
        ▼                                         ▼
┌───────────────────────────────┐ ┌───────────────────────────────┐
│ listLatestNews(53)            │ │ getLatestBlogPost()           │
│ (MySQL DB / Cache)            │ │ (lib/server/blog/queries.ts)  │
└───────────────┬───────────────┘ └───────────────┬───────────────┘
                │                                 │
                │ [items 0..2] -> Hero            │ Fetch https://blog.j172.tw/feed/
                │ [items 3..]  -> NewsPool (23)   │ ISR: revalidate: 3600 (1 hour)
                │                                 │ Extract Featured Image (wp-post-image)
                │                                 │ Fallback: Brand Gradient Card
                └────────────────┬────────────────┘
                                 ▼
                ┌─────────────────────────────────┐
                │ HomeCategoryNewsSection         │
                │ activeCategoryKey === 'all':    │
                │ 23 News Cards + 1 Blog Card     │
                │ (Total 24 Cards in Grid)        │
                └─────────────────────────────────┘
```

---

## 3. Detailed Component Implementation

### 3.1 Server-Side Blog Query Module (`lib/server/blog/queries.ts`)
- **RSS Ingestion**: Fetches `https://blog.j172.tw/feed/` using native `fetch` with `next: { revalidate: 3600 }` and an `AbortController` timeout guard (6 seconds).
- **XML Entity Decoding**: Unescapes numeric and named HTML/XML entities (e.g. `&#8211;` to `–`, `&#8217;` to `’`, `&amp;` to `&`).
- **Thumbnail Resolution**:
  1. Requests the individual article page with `revalidate: 86400` (24-hour cache).
  2. Extracts the WordPress featured image class (`wp-post-image` / `attachment-thumbnail`), OpenGraph image (`meta[property="og:image"]`), or Twitter card image.
  3. Returns `card_image_url` if found; otherwise returns `null` to activate `CardThumb`'s source-branded gradient fallback.
- **Model Projection**: Maps the parsed entry into a compliant `NewsListItem`:
  - `id`: `-1` (Negative ID denotes synthetic external entity)
  - `source_name`: `"blog_j172"`
  - `feed_code`: `"blog_j172"`
  - `feed_name`: `"j172tw Blogz"`
  - `dept_name`: `<dc:creator>` value (defaults to `"Jay Fan-Chiang"`)
  - `canonical_url`: Article permalink (`https://blog.j172.tw/...`)
  - `card_image_source`: `"og_image"`

### 3.2 Source Label & Badge Configuration (`lib/server/news/sourceLabels.ts` & `sourceCategories.ts`)
- Registered `"blog_j172": "j172tw Blogz"` in `SOURCE_LABELS`.
- Non-government category styling defaults to the indigo badge theme (`bg-indigo-50 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-300`).

### 3.3 Card Component External Navigation (`components/News/NewsCard.tsx`)
- Detects external entries when `isExternal` is set, `item.id < 0`, or `item.source_name === "blog_j172"`.
- Sets `href` directly to `item.canonical_url`.
- Attaches `{ target: "_blank", rel: "noopener noreferrer" }` to:
  - Thumbnail container `<a>` / `<Link>`
  - Article title `<h2>` link
  - Action link (`閱讀全文 →`)

### 3.4 Grid Slotting & Category Filter Logic (`components/News/HomeCategoryNewsSection.tsx`)
- Accepts optional `blogItem?: NewsListItem | null`.
- **"All" Category (`activeCategoryKey === 'all'`)**:
  - Slices the first 23 items from `items` and appends `blogItem` at position 24 (`[...items.slice(0, 23), blogItem]`).
  - If `blogItem` is `null` (e.g. RSS outage), renders the full 24 items from standard news.
- **Specific Source Categories** (e.g. Government, UDN, CNA, LTN):
  - Renders strictly filtered news matching category `sourceNames` up to `HOME_CARD_LIMIT`, preserving category purity without blog injection.

---

## 4. Resilience & Error Handling

1. **Network Timeout Guard**: A 6-second timeout prevents slow external RSS responses from delaying the Next.js server-side render.
2. **Silent Degradation**: Any network error, HTTP error status, or XML parsing failure is caught and logged as a warning; `getLatestBlogPost()` returns `null`, seamlessly displaying the 24th standard news item without UI layout breakage.
3. **ISR Cache Segregation**: The RSS feed (1-hour revalidation) and article OpenGraph images (24-hour revalidation) are cached independently, minimizing external load on `blog.j172.tw`.

---

## 5. Verification & Validation Checklist

- [x] TypeScript compiler verification (`npx tsc --noEmit`) passes with 0 errors.
- [x] Server-side RSS fetching and thumbnail extraction verified via test execution.
- [x] External links render with `target="_blank"` and `rel="noopener noreferrer"`.
- [x] Grid layout displays exactly 24 cards on the "All" tab.
- [x] Category tab switches (e.g., to "自由時報") hide the blog card and display pure category news.
