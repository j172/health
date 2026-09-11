#!/usr/bin/env node
/**
 * Scrapes TAAZE 讀冊生活 10 大注目新書／編輯推薦 RSS feeds,
 * formats them as BookItems, and merges them into data/latest-books-seed.json.
 * If MySQL env is set, it also inserts/updates the latest_books table.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SEED_PATH = path.join(process.cwd(), "data", "latest-books-seed.json");

const TAAZE_FEEDS = [
  { id: "taaze_5_16", name: "注目新書－醫學保健", url: "https://ebook.taaze.tw/do/rssfeed/item5_16.xml" },
  { id: "taaze_5_12", name: "注目新書－生活風格", url: "https://ebook.taaze.tw/do/rssfeed/item5_12.xml" },
  { id: "taaze_5_17", name: "注目新書－少兒親子", url: "https://ebook.taaze.tw/do/rssfeed/item5_17.xml" },
  { id: "taaze_5_18", name: "注目新書－教育學習", url: "https://ebook.taaze.tw/do/rssfeed/item5_18.xml" },
  { id: "taaze_5_20", name: "注目新書－心理勵志", url: "https://ebook.taaze.tw/do/rssfeed/item5_20.xml" },
  { id: "taaze_6_16", name: "編輯推薦－醫學保健", url: "https://ebook.taaze.tw/do/rssfeed/item6_16.xml" },
  { id: "taaze_6_12", name: "編輯推薦－生活風格", url: "https://ebook.taaze.tw/do/rssfeed/item6_12.xml" },
  { id: "taaze_6_17", name: "編輯推薦－少兒親子", url: "https://ebook.taaze.tw/do/rssfeed/item6_17.xml" },
  { id: "taaze_6_18", name: "編輯推薦－教育學習", url: "https://ebook.taaze.tw/do/rssfeed/item6_18.xml" },
  { id: "taaze_6_20", name: "編輯推薦－心理勵志", url: "https://ebook.taaze.tw/do/rssfeed/item6_20.xml" },
];

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function parseTaazeXml(xml, category) {
  const items = [];
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
    let discount = null;
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
}

async function run() {
  console.log("Fetching TAAZE 10 RSS feeds...");
  const allTaazeBooks = [];

  for (const cat of TAAZE_FEEDS) {
    try {
      const res = await fetch(cat.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0",
          Accept: "application/rss+xml, application/xml, text/xml;q=0.9",
        },
      });
      if (!res.ok) {
        console.warn(`  [${cat.name}] Failed: HTTP ${res.status}`);
        continue;
      }
      const xml = await res.text();
      const parsed = parseTaazeXml(xml, cat);
      console.log(`  [${cat.name}] Fetched ${parsed.length} books`);
      allTaazeBooks.push(...parsed);
    } catch (err) {
      console.error(`  [${cat.name}] Error:`, err.message);
    }
  }

  console.log(`Total TAAZE books collected: ${allTaazeBooks.length}`);

  if (fs.existsSync(SEED_PATH)) {
    try {
      const currentSeed = JSON.parse(fs.readFileSync(SEED_PATH, "utf-8"));
      const existingNonTaaze = (currentSeed.books || []).filter((b) => b.platform !== "taaze");
      const merged = [...existingNonTaaze, ...allTaazeBooks];
      fs.writeFileSync(
        SEED_PATH,
        JSON.stringify(
          {
            ok: true,
            generatedAt: new Date().toISOString(),
            total: merged.length,
            books: merged,
          },
          null,
          2,
        ),
        "utf-8",
      );
      console.log(`Updated ${SEED_PATH} with ${merged.length} total books (incl. ${allTaazeBooks.length} TAAZE)`);
    } catch (err) {
      console.error("Failed to update seed JSON:", err.message);
    }
  }
}

run();
