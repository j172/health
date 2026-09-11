import "server-only";
import { load } from "cheerio";
import type { BookCategoryConfig, BookItem } from "./types";
import { httpGetText } from "@/lib/server/net/httpClient";
import { sha256, toAbsoluteUrl } from "@/lib/server/rss/scraperUtils";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
};

/**
 * Pure parser for 博客來暢銷榜／新書榜 HTML.
 */
export const parseBooksComTwHtml = (html: string, category: BookCategoryConfig): BookItem[] => {
  const $ = load(html);
  const items: BookItem[] = [];
  const seenUrls = new Set<string>();

  // 博客來榜單常用容器: .type02_bd-a, .mod_b .item, .box_1, li.item
  const elements = $("li.item, .item, .wrap > li, .box_1, .mod_b .item, .type02_bd-a").toArray();

  let fallbackRank = 1;
  for (const el of elements) {
    const $el = $(el);
    const titleAnchor = $el.find("h4 a, .title a, a[href*='products']").first();
    const rawHref = titleAnchor.attr("href") || $el.find("a[href*='products']").first().attr("href");
    if (!rawHref || !rawHref.includes("products")) continue;

    const productUrl = toAbsoluteUrl(rawHref, "https://www.books.com.tw");
    if (seenUrls.has(productUrl)) continue;

    const title = (titleAnchor.text() || titleAnchor.attr("title") || "").trim().replace(/\s+/g, " ");
    if (!title || title.length < 2) continue;
    seenUrls.add(productUrl);

    // Rank
    const rankText = $el.find(".ranking, .no, .num, .rank, span.no").text().trim();
    const parsedRank = parseInt(rankText, 10);
    const ranking = !isNaN(parsedRank) && parsedRank > 0 ? parsedRank : fallbackRank++;

    // Author & Publisher
    const msgList = $el.find("ul.msg li, .info li, .msg li");
    let author: string | null = null;
    let publisher: string | null = null;
    let publishDate: string | null = null;

    msgList.each((_, li) => {
      const text = $(li).text().trim();
      if (text.includes("作者：") || text.includes("作　者：")) {
        author = text.replace(/作\s*者：/, "").trim();
      } else if (text.includes("出版社：")) {
        publisher = text.replace("出版社：", "").trim();
      } else if (text.includes("出版日期：")) {
        publishDate = text.replace("出版日期：", "").trim();
      }
    });

    if (!author) {
      const authorAnchor = $el.find("a[href*='mid_author'], a[href*='adv_author']").first();
      if (authorAnchor.length > 0) author = authorAnchor.text().trim();
    }
    if (!publisher) {
      const pubAnchor = $el.find("a[href*='mid_publish'], a[href*='adv_publish']").first();
      if (pubAnchor.length > 0) publisher = pubAnchor.text().trim();
    }

    // Cover image
    let img = $el.find("img.cover, img.itemcov_img, .cover img, img").first();
    if (!img.length || !img.attr("src")) {
      const container = $el.closest("li, .item, .box_1");
      if (container.length) {
        img = container.find("img.cover, img.itemcov_img, .cover img, img").first();
      }
    }
    const coverUrl = img.attr("src") || img.attr("data-original") || null;

    // Price & Discount
    const priceText = $el.find(".price, ul.price, .set2").text().trim();
    let listPrice: number | null = null;
    let salePrice: number | null = null;
    let discount: string | null = null;

    const discountMatch = priceText.match(/(\d{1,2})折/);
    if (discountMatch) {
      discount = `${discountMatch[1]}折`;
    }

    const priceMatches = [...priceText.matchAll(/(\d{2,5})\s*元/g)].map((m) => parseInt(m[1], 10));
    if (priceMatches.length === 1) {
      salePrice = priceMatches[0];
    } else if (priceMatches.length >= 2) {
      listPrice = Math.max(priceMatches[0], priceMatches[1]);
      salePrice = Math.min(priceMatches[0], priceMatches[1]);
    }

    const payloadHash = sha256(JSON.stringify({ title, productUrl, categoryId: category.id }));

    items.push({
      platform: "books_com_tw",
      categoryId: category.id,
      categoryName: category.name,
      ranking,
      title,
      subtitle: null,
      author,
      translator: null,
      publisher,
      publishDate,
      coverUrl: coverUrl ? toAbsoluteUrl(coverUrl, "https://www.books.com.tw") : null,
      productUrl,
      isbn: null,
      listPrice,
      salePrice,
      discount,
      description: null,
      payloadHash,
    });
  }

  return items;
};

/**
 * Pure parser for 誠品線上分類書籍 HTML.
 */
export const parseEsliteHtml = (html: string, category: BookCategoryConfig): BookItem[] => {
  const $ = load(html);
  const items: BookItem[] = [];
  const seenUrls = new Set<string>();

  // 誠品常用容器: .product-item, .product-card, .list-item, a[href*='/product/']
  const elements = $(".product-item, .product-card, .list-item, div[class*='productCard']").toArray();

  const candidates = elements.length > 0 ? elements : $("a[href*='/product/']").toArray();

  for (const el of candidates) {
    const $el = $(el);
    const anchor = $el.is("a") ? $el : $el.find("a[href*='/product/']").first();
    const rawHref = anchor.attr("href");
    if (!rawHref || !rawHref.includes("/product/")) continue;

    const productUrl = toAbsoluteUrl(rawHref, "https://www.eslite.com");
    if (seenUrls.has(productUrl)) continue;

    const title = (
      $el.find(".product-name, .title, h3, h4").first().text() ||
      anchor.attr("title") ||
      anchor.text()
    ).trim().replace(/\s+/g, " ");

    if (!title || title.length < 2) continue;
    seenUrls.add(productUrl);

    const author = ($el.find(".product-author, .author").first().text() || "").trim() || null;
    const publisher = ($el.find(".product-publisher, .publisher").first().text() || "").trim() || null;

    const img = $el.find("img").first();
    const coverUrl = img.attr("src") || img.attr("data-src") || null;

    const priceText = $el.find(".product-price, .price").text().trim();
    let salePrice: number | null = null;
    let listPrice: number | null = null;
    let discount: string | null = null;

    const priceMatch = priceText.match(/(?:NT\$|特價|優惠價|元|\$)\s*(\d{2,5})/i);
    if (priceMatch) {
      salePrice = parseInt(priceMatch[1], 10);
    }

    const payloadHash = sha256(JSON.stringify({ title, productUrl, categoryId: category.id }));

    items.push({
      platform: "eslite",
      categoryId: category.id,
      categoryName: category.name,
      ranking: null,
      title,
      subtitle: null,
      author,
      translator: null,
      publisher,
      publishDate: null,
      coverUrl: coverUrl ? toAbsoluteUrl(coverUrl, "https://www.eslite.com") : null,
      productUrl,
      isbn: null,
      listPrice,
      salePrice,
      discount,
      description: null,
      payloadHash,
    });
  }

  return items;
};

/**
 * Pure parser for TAAZE 讀冊生活 RSS feed XML.
 */
export const parseTaazeRssXml = (xml: string, category: BookCategoryConfig): BookItem[] => {
  const items: BookItem[] = [];
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];

  let rank = 1;
  for (const match of itemMatches) {
    const itemXml = match[1];
    const rawTitle = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim();
    const rawLink = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/)?.[1]?.trim();
    if (!rawTitle || !rawLink) continue;

    const title = rawTitle.replace(/\s+/g, " ");
    const productUrl = rawLink.startsWith("http://") ? rawLink.replace("http://", "https://") : rawLink;

    const descRaw = itemXml.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "";
    const descDecoded = descRaw
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");

    const rawImg = descDecoded.match(/src="([^"]+)"/)?.[1];
    const coverUrl = rawImg
      ? (rawImg.startsWith("http://") ? rawImg.replace("http://", "https://") : rawImg)
      : null;

    const pubDate = descDecoded.match(/出版日期[^0-9]*([0-9]{4}-[0-9]{2}-[0-9]{2})/)?.[1] || null;
    const rawListPrice = descDecoded.match(/定價[^0-9]*([0-9]+)/)?.[1];
    const rawSalePrice = descDecoded.match(/特價[^0-9]*([0-9]+)/)?.[1];

    const listPrice = rawListPrice ? parseInt(rawListPrice, 10) : null;
    const salePrice = rawSalePrice ? parseInt(rawSalePrice, 10) : null;
    let discount: string | null = null;
    if (listPrice && salePrice && listPrice > 0 && salePrice < listPrice) {
      discount = `${Math.round((salePrice / listPrice) * 100)}折`;
    }

    const payloadHash = sha256(JSON.stringify({ title, productUrl, categoryId: category.id }));

    items.push({
      platform: "taaze",
      categoryId: category.id,
      categoryName: category.name,
      ranking: rank++,
      title,
      subtitle: null,
      author: null,
      translator: null,
      publisher: null,
      publishDate: pubDate,
      coverUrl,
      productUrl,
      isbn: null,
      listPrice,
      salePrice,
      discount,
      description: null,
      payloadHash,
    });
  }

  return items;
};

/**
 * Fetch and scrape a category from its source.
 */
export const scrapeCategory = async (category: BookCategoryConfig): Promise<BookItem[]> => {
  try {
    const res = await httpGetText(category.url, {
      headers: DEFAULT_HEADERS,
      timeoutMs: 15_000,
    });

    if (res.status < 200 || res.status >= 300) {
      console.warn(`[scrapeCategory] HTTP ${res.status} for ${category.name} (${category.url})`);
      return [];
    }

    if (category.platform === "books_com_tw") {
      return parseBooksComTwHtml(res.text, category);
    } else if (category.platform === "taaze") {
      return parseTaazeRssXml(res.text, category);
    } else {
      return parseEsliteHtml(res.text, category);
    }
  } catch (err: any) {
    console.error(`[scrapeCategory] Error scraping ${category.name}:`, err.message);
    return [];
  }
};

