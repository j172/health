import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

process.env.MYSQL_HOST = "localhost";
process.env.MYSQL_USER = "test";
process.env.MYSQL_PASSWORD = "test";
process.env.MYSQL_DATABASE = "test";
process.env.RSS_SYNC_ADMIN_SECRET = "test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { BOOKS_CATEGORIES, getCategoryById, getCategoriesByPlatform } = await import("./categories.ts");
const { parseBooksComTwHtml, parseEsliteHtml } = await import("./scraper.ts");
const { loadOfflineBooksSeed, filterAndSortBooks } = await import("./service.ts");
const { getToolCatalogEntry } = await import("../tools/catalog.ts");

test("Phase 4: BOOKS_CATEGORIES contains all 4 博客來 and 27 誠品 categories (31 total)", () => {
  assert.equal(BOOKS_CATEGORIES.length, 31, "Total categories must be exactly 31");

  const booksCats = getCategoriesByPlatform("books_com_tw");
  assert.equal(booksCats.length, 4, "Must have exactly 4 Books.com.tw categories");
  const booksIds = booksCats.map((c) => c.id);
  assert.ok(booksIds.includes("books_topm_04"), "Must include 心理勵志");
  assert.ok(booksIds.includes("books_topm_07"), "Must include 醫療保健");
  assert.ok(booksIds.includes("books_topm_08"), "Must include 飲食料理");
  assert.ok(booksIds.includes("books_topm_13"), "Must include 親子教養");

  const esliteCats = getCategoriesByPlatform("eslite");
  assert.equal(esliteCats.length, 27, "Must have exactly 27 Eslite categories");
  const esliteIds = esliteCats.map((c) => c.id);
  assert.ok(esliteIds.includes("cat_3_154"), "Must include 醫學總論");
  assert.ok(esliteIds.includes("cat_3_155"), "Must include 中醫／針灸");
  assert.ok(esliteIds.includes("cat_3_158"), "Must include 養生／長壽");
  assert.ok(esliteIds.includes("cat_3_50704"), "Must include 樂齡保健");
  assert.ok(esliteIds.includes("cat_3_50705"), "Must include 長照關懷");
  assert.ok(esliteIds.includes("cat_3_50699"), "Must include 犬類照護");
  assert.ok(esliteIds.includes("cat_3_50700"), "Must include 貓咪照護");
});

test("Phase 4: parseBooksComTwHtml correctly parses 博客來 bestseller item HTML", () => {
  const category = getCategoryById("books_topm_07");
  assert.ok(category);

  const sampleHtml = `
    <ul class="wrap">
      <li class="item">
        <span class="no">1</span>
        <div class="box_1">
          <a href="/products/0010998877?loc=P_0001_001">
            <img class="cover" src="https://im1.book.com.tw/image/getImage?i=https://www.books.com.tw/img/001/099/88/0010998877.jpg&w=348&h=348" alt="逆轉大腦發炎" />
          </a>
          <div class="type02_bd-a">
            <h4><a href="/products/0010998877?loc=P_0001_001">逆轉大腦發炎：重啟神經修復力的高效飲食</a></h4>
            <ul class="msg">
              <li>作者：大衛‧博瑪特 (David Perlmutter)</li>
              <li>出版社：天下生活</li>
              <li>出版日期：2026/08/15</li>
            </ul>
            <ul class="price">
              <li>優惠價：<b>79</b>折，<b>316</b>元</li>
              <li>定價：400元</li>
            </ul>
          </div>
        </div>
      </li>
    </ul>
  `;

  const items = parseBooksComTwHtml(sampleHtml, category);
  assert.equal(items.length, 1);
  const book = items[0];
  assert.equal(book.platform, "books_com_tw");
  assert.equal(book.categoryId, "books_topm_07");
  assert.equal(book.ranking, 1);
  assert.equal(book.title, "逆轉大腦發炎：重啟神經修復力的高效飲食");
  assert.equal(book.author, "大衛‧博瑪特 (David Perlmutter)");
  assert.equal(book.publisher, "天下生活");
  assert.equal(book.publishDate, "2026/08/15");
  assert.equal(book.salePrice, 316);
  assert.equal(book.listPrice, 400);
  assert.equal(book.discount, "79折");
  assert.ok(book.productUrl.includes("/products/0010998877"));
  assert.ok(book.coverUrl?.includes("0010998877.jpg"));
});

test("Phase 4: parseEsliteHtml correctly parses 誠品線上 category item HTML", () => {
  const category = getCategoryById("cat_3_158");
  assert.ok(category);

  const sampleHtml = `
    <div class="product-list">
      <div class="product-card">
        <a href="/product/1001129722682481092004">
          <img class="product-img" src="https://photo.eslite.com/m/s/100112972/2682481092004.jpg" />
          <h3 class="product-name">超越百歲：長壽的科學與藝術</h3>
        </a>
        <div class="product-author">彼得‧阿提亞</div>
        <div class="product-publisher">天下生活</div>
        <div class="product-price">特價 NT$ 458</div>
      </div>
    </div>
  `;

  const items = parseEsliteHtml(sampleHtml, category);
  assert.equal(items.length, 1);
  const book = items[0];
  assert.equal(book.platform, "eslite");
  assert.equal(book.categoryId, "cat_3_158");
  assert.equal(book.title, "超越百歲：長壽的科學與藝術");
  assert.equal(book.author, "彼得‧阿提亞");
  assert.equal(book.publisher, "天下生活");
  assert.equal(book.salePrice, 458);
  assert.ok(book.productUrl.includes("/product/1001129722682481092004"));
  assert.ok(book.coverUrl?.includes("2682481092004.jpg"));
});

test("Phase 4: loadOfflineBooksSeed and filterAndSortBooks provide robust offline fallback", () => {
  const seedBooks = loadOfflineBooksSeed();
  assert.ok(Array.isArray(seedBooks), "Seed books must be an array");
  assert.ok(seedBooks.length >= 31, `Expected at least 31 seed books, got ${seedBooks.length}`);

  // Test filter by platform
  const booksRes = filterAndSortBooks(seedBooks, { platform: "books_com_tw" });
  assert.ok(booksRes.books.length > 0);
  assert.ok(booksRes.books.every((b) => b.platform === "books_com_tw"));

  // Test filter by category
  const catRes = filterAndSortBooks(seedBooks, { categoryId: "books_topm_04" });
  assert.ok(catRes.books.length > 0);
  assert.ok(catRes.books.every((b) => b.categoryId === "books_topm_04"));

  // Test keyword search
  const searchRes = filterAndSortBooks(seedBooks, { search: "原子習慣" });
  assert.ok(searchRes.books.length >= 1);
  assert.equal(searchRes.books[0].title, "原子習慣：細微改變帶來巨大成就的實證法則");

  // Test price sort
  const priceSorted = filterAndSortBooks(seedBooks, { sortBy: "priceAsc" });
  assert.ok(priceSorted.books.length > 1);
  for (let i = 1; i < priceSorted.books.length; i++) {
    const prev = priceSorted.books[i - 1].salePrice ?? 0;
    const curr = priceSorted.books[i].salePrice ?? 0;
    assert.ok(prev <= curr, "Must be sorted ascending by salePrice");
  }
});

test("Phase 4: latest-books is registered in TOOL_CATALOG under 'public-facility' group", () => {
  const entry = getToolCatalogEntry("latest-books");
  assert.ok(entry, "latest-books must exist in TOOL_CATALOG");
  assert.equal(entry.group, "public-facility", "latest-books must belong to public-facility (便民服務)");
  assert.equal(entry.title, "最新書籍：博客來暢銷榜與誠品選書");
  assert.ok(entry.description.length > 20);
  assert.ok(entry.directAnswer.length > 20);
  assert.ok(entry.faqs.length >= 3);
  assert.ok(entry.scientificBasis.length >= 2);
  assert.ok(entry.relatedSlugs.includes("bookstores"));
});
