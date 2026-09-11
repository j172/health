import "server-only";
import * as cheerio from "cheerio";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import { httpGetText } from "@/lib/server/net/httpClient";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

export interface IngestExternalEventsResult {
  ok: boolean;
  yahooCount: number;
  lecoinCount: number;
  igivingCount: number;
  npostCount: number;
  accupassCount: number;
  ticketingCount: number;
  totalUpserted: number;
}

interface NormalizedEvent {
  uid: string;
  title: string;
  titleEn?: string | null;
  category: "charity_project" | "ticketing" | "npo";
  categoryLabel: string;
  description: string;
  descriptionEn?: string | null;
  imageUrl?: string | null;
  masterUnit?: string | null;
  startDate: string;
  endDate: string;
  sourceWebPromote?: string | null;
  webSales?: string | null;
  location: string;
  city: string;
}

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

async function fetchHtml(url: string, timeoutMs = 12_000): Promise<string> {
  const { status, text } = await httpGetText(url, { headers: DEFAULT_HEADERS, timeoutMs });
  if (status >= 200 && status < 300) return text;
  throw new Error(`HTTP ${status} for ${url}`);
}

async function scrapeYahooProjects(): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];
  try {
    const html = await fetchHtml("https://tw.charity.yahoo.com/project_list.html");
    const $ = cheerio.load(html);

    $("a[href*='project_donation.html']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const idMatch = href.match(/project_id=(\d+)/);
      if (!idMatch) return;
      const pid = idMatch[1];
      const title = $(el).text().trim().replace(/\s+/g, " ");
      if (!title || title.length < 3) return;

      const parent = $(el).closest("li, .card, div");
      const orgName = parent.find("a[href*='org_id']").text().trim() || "Yahoo! 公益合作夥伴";
      const img = parent.find("img").attr("src") || null;

      const uid = `yahoo_proj_${pid}`;
      const url = href.startsWith("http") ? href : `https://tw.charity.yahoo.com/${href.replace(/^\//, "")}`;

      events.push({
        uid,
        title,
        titleEn: null,
        category: "charity_project",
        categoryLabel: "❤️ 公益專案/線上募款",
        description: `${orgName} 線上公益專案：${title}。歡迎透過 Yahoo! 公益進行線上小額捐款，共同守護弱勢群體。`,
        descriptionEn: `Charity project by ${orgName}: ${title}. Support via Yahoo! Charity Taiwan.`,
        imageUrl: img,
        masterUnit: orgName,
        startDate: "2026/01/01",
        endDate: "2026/12/31",
        sourceWebPromote: url,
        webSales: url,
        location: "線上支持 / 全台服務",
        city: "全國",
      });
    });
  } catch (err) {
    console.warn("[Ingest External Events] Yahoo projects scrape failed:", err);
  }
  return events;
}

async function scrapeLecoinProjects(): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];
  try {
    const html = await fetchHtml("https://lecoin.cc/");
    const $ = cheerio.load(html);

    $("a[href*='/donation/']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const idMatch = href.match(/\/donation\/(\d+)/);
      if (!idMatch) return;
      const did = idMatch[1];
      const title = $(el).text().trim().replace(/\s+/g, " ");
      if (!title || title.length < 4) return;

      const parent = $(el).closest("li, .card, div");
      const orgText = parent.find("a[href*='/organization/']").text().trim();
      const orgName = orgText.replace(/^勸募者\/?/, "").trim() || "樂公益合作機構";
      const img = parent.find("img").attr("src") || null;

      const uid = `lecoin_proj_${did}`;
      const url = `https://lecoin.cc/donation/${did}`;

      events.push({
        uid,
        title,
        titleEn: null,
        category: "charity_project",
        categoryLabel: "❤️ 公益專案/線上募款",
        description: `【樂公益募款專案】${title}。主辦單位：${orgName}。邀請大眾伸出援手支持愛心募資行動。`,
        descriptionEn: `Fundraising project: ${title} organized by ${orgName} on Lecoin Taiwan.`,
        imageUrl: img ? (img.startsWith("http") ? img : `https://lecoin.cc${img}`) : null,
        masterUnit: orgName,
        startDate: "2026/01/01",
        endDate: "2026/12/31",
        sourceWebPromote: url,
        webSales: url,
        location: "線上支持 / 樂公益平台",
        city: "全國",
      });
    });
  } catch (err) {
    console.warn("[Ingest External Events] Lecoin projects scrape failed:", err);
  }
  return events;
}

async function scrapeIgivingProjects(): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];
  try {
    const html = await fetchHtml("https://www.igiving.org.tw/contents/project");
    const $ = cheerio.load(html);

    $("a[href*='project_ct']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const idMatch = href.match(/p_id=(\d+)/);
      if (!idMatch) return;
      const pid = idMatch[1];
      const title = $(el).text().trim().replace(/\s+/g, " ");
      if (!title || title.length < 4) return;

      const parent = $(el).closest("li, .card, div");
      const orgName = parent.find(".npo-name, h4, p").first().text().trim() || "iGiving 公益夥伴";
      const img = parent.find("img").attr("src") || null;

      const uid = `igiving_proj_${pid}`;
      const url = `https://www.igiving.org.tw/contents/project_ct?p_id=${pid}`;

      events.push({
        uid,
        title,
        titleEn: null,
        category: "charity_project",
        categoryLabel: "❤️ 公益專案/線上募款",
        description: `iGiving 公益網線上捐款專案：${title}。推動機構：${orgName}。`,
        descriptionEn: `iGiving Taiwan charity project: ${title} by ${orgName}.`,
        imageUrl: img ? (img.startsWith("http") ? img : `https://www.igiving.org.tw${img}`) : null,
        masterUnit: orgName,
        startDate: "2026/01/01",
        endDate: "2026/12/31",
        sourceWebPromote: url,
        webSales: url,
        location: "線上支持 / iGiving公益網",
        city: "全國",
      });
    });
  } catch (err) {
    console.warn("[Ingest External Events] iGiving projects scrape failed:", err);
  }
  return events;
}

async function scrapeNpostEvents(): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];
  try {
    const html = await fetchHtml("https://npost.tw/archives/category/%e8%bf%91%e6%9c%9f%e6%b4%bb%e5%8b%95");
    const $ = cheerio.load(html);

    $("article a[href*='/archives/'], .entry-title a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const idMatch = href.match(/\/archives\/(\d+)/);
      if (!idMatch) return;
      const aid = idMatch[1];
      const title = $(el).text().trim().replace(/\s+/g, " ");
      if (!title || title.length < 5 || title.includes("閱讀全文")) return;

      const article = $(el).closest("article");
      const timeStr = article.find("time").attr("datetime") || article.find("time").text().trim();
      const date = timeStr ? timeStr.slice(0, 10).replace(/-/g, "/") : "2026/09/01";
      const img = article.find("img").attr("src") || null;

      const uid = `npost_ev_${aid}`;

      events.push({
        uid,
        title,
        titleEn: null,
        category: "npo",
        categoryLabel: "🤝 公益活動",
        description: `NPOst 公益交流站近期倡議與志工活動：${title}。`,
        descriptionEn: `NPOst Taiwan event: ${title}.`,
        imageUrl: img,
        masterUnit: "NPOst 公益交流站",
        startDate: date,
        endDate: date,
        sourceWebPromote: href,
        webSales: href,
        location: "實體活動 / 台灣各地",
        city: "臺北市",
      });
    });
  } catch (err) {
    console.warn("[Ingest External Events] NPOst events scrape failed:", err);
  }
  return events;
}

async function scrapeAccupassAndPlatforms(): Promise<NormalizedEvent[]> {
  const events: NormalizedEvent[] = [];

  // Curated prominent ticketing showcases & platform entries
  const platforms = [
    {
      uid: "platform_accupass_north",
      title: "ACCUPASS 活動通：大台北與北部熱門藝文展演活動",
      titleEn: "ACCUPASS: Northern Taiwan Featured Events, Workshops & Culture",
      category: "ticketing" as const,
      categoryLabel: "🎟️ 售票展演",
      description: "匯聚全台最多元之講座、音樂展演、手作工作坊、科技沙龍與生活風格活動。",
      descriptionEn: "Discover the latest events, live music, workshops, and exhibitions in Northern Taiwan on ACCUPASS.",
      imageUrl: "https://static.accupass.com/eventbanner/2608251039291412963503.jpg",
      masterUnit: "ACCUPASS 活動通",
      startDate: "2026/01/01",
      endDate: "2026/12/31",
      url: "https://www.accupass.com/?area=north",
      location: "北部各展演場館 / 線上活動",
      city: "臺北市",
    },
    {
      uid: "platform_kktix_events",
      title: "KKTIX 售票系統：演唱會、戲劇、脫口秀與文創售票",
      titleEn: "KKTIX: Live Concerts, Theater & Entertainment Ticketing",
      category: "ticketing" as const,
      categoryLabel: "🎟️ 售票展演",
      description: "台灣主流演唱會、音樂祭、舞台劇、脫口秀與國際巡迴售票平台。",
      descriptionEn: "Taiwan's leading ticketing platform for pop concerts, music festivals, comedy shows, and indie gigs.",
      imageUrl: "https://kktix.com/assets/kktix-logo.png",
      masterUnit: "KKTIX 售票",
      startDate: "2026/01/01",
      endDate: "2026/12/31",
      url: "https://kktix.com/",
      location: "全台各大小巨蛋、音樂中心、展演廳",
      city: "臺北市",
    },
    {
      uid: "platform_ibon_entertainment",
      title: "ibon 售票系統：熱門展覽、舞台劇、運動賽事與藝文門票",
      titleEn: "ibon Ticketing: Exhibitions, Drama, Sports & Entertainment",
      category: "ticketing" as const,
      categoryLabel: "🎟️ 售票展演",
      description: "7-ELEVEN ibon 串聯全台門市與線上購票，提供大型特展、舞台劇、棒球籃球賽事售票取票服務。",
      descriptionEn: "7-Eleven ibon ticketing network covering nationwide exhibitions, live theatrical plays, baseball games, and concerts.",
      imageUrl: "https://ticket.ibon.com.tw/Images/logo.png",
      masterUnit: "ibon 售票系統",
      startDate: "2026/01/01",
      endDate: "2026/12/31",
      url: "https://tour.ibon.com.tw/home/exhibition",
      location: "全台 7-ELEVEN 門市 / 各大展覽館",
      city: "全國",
    },
    {
      uid: "platform_books_tickets",
      title: "博客來售票網：國際藝術特展、設計展、親子表演與講座",
      titleEn: "Books.com.tw Tickets: Art Exhibitions, Design Fairs & Family Shows",
      category: "ticketing" as const,
      categoryLabel: "🎟️ 售票展演",
      description: "博客來旗艦級藝文售票平台，涵蓋華山1914、松山文創、高流、中正紀念堂等指標性特展預售票與早鳥優惠。",
      descriptionEn: "Books.com.tw cultural ticketing hub featuring major international museum exhibitions, design expos, and stage shows.",
      imageUrl: "https://tickets.books.com.tw/images/logo.png",
      masterUnit: "博客來售票網",
      startDate: "2026/01/01",
      endDate: "2026/12/31",
      url: "https://tickets.books.com.tw/index/",
      location: "全台各市立美術館、文化園區特展館",
      city: "臺北市",
    },
    {
      uid: "platform_tixcraft",
      title: "tixCraft 拓元售票系統：旗艦級巨星演唱會售票專區",
      titleEn: "tixCraft: Major Pop Concerts & Arena World Tours",
      category: "ticketing" as const,
      categoryLabel: "🎟️ 售票展演",
      description: "專門承辦台北小巨蛋、高雄世運主場館、大巨蛋之國內外一線天王天后巡迴演唱會購票服務。",
      descriptionEn: "Official ticketing partner for Taiwan's largest stadium and arena concert tours.",
      imageUrl: "https://tixcraft.com/images/logo.png",
      masterUnit: "tixCraft 拓元售票",
      startDate: "2026/01/01",
      endDate: "2026/12/31",
      url: "https://tixcraft.com/activity",
      location: "台北大巨蛋、台北小巨蛋、高雄國家體育場",
      city: "臺北市",
    },
    {
      uid: "platform_kham_tickets",
      title: "寬宏售票系統：經典百老匯音樂劇、冰上饗宴、交響樂與海外特展",
      titleEn: "KHAM Ticketing: Broadway Musicals, Orchestras & International Exhibitions",
      category: "ticketing" as const,
      categoryLabel: "🎟️ 售票展演",
      description: "引進全球知名百老匯音樂劇、迪士尼冰上世界、國外經典特展與交響樂團巡演。",
      descriptionEn: "KHAM ticket portal for Broadway shows, Disney on Ice, world-class symphonies, and cultural spectacles.",
      imageUrl: "https://kham.com.tw/images/logo.png",
      masterUnit: "寬宏藝術 KHAM",
      startDate: "2026/01/01",
      endDate: "2026/12/31",
      url: "https://kham.com.tw/application/utk01/UTK0101_03.aspx",
      location: "國家戲劇院、國家音樂廳、台北小巨蛋",
      city: "臺北市",
    },
    {
      uid: "platform_ticketplus",
      title: "Ticket Plus 遠大售票：新世代文創音樂活動與見面會",
      titleEn: "Ticket Plus: Modern Music Events & Fan Meetings",
      category: "ticketing" as const,
      categoryLabel: "🎟️ 售票展演",
      description: "專注於動漫音樂節、各國偶像粉絲見面會、獨立音樂專場之便捷售票平台。",
      descriptionEn: "Contemporary ticket portal for indie festivals, anime musical events, and fan gatherings.",
      imageUrl: "https://ticketplus.com.tw/assets/logo.png",
      masterUnit: "Ticket Plus 遠大售票",
      startDate: "2026/01/01",
      endDate: "2026/12/31",
      url: "https://ticketplus.com.tw/",
      location: "Zepp New Taipei、Legacy、各展演空間",
      city: "新北市",
    },
    {
      uid: "platform_era_ticket",
      title: "年代售票系統：傳統戲曲、古典交響樂、芭蕾舞與在地劇團",
      titleEn: "ERA Ticket: Classical Symphonies, Ballet, Traditional Opera & Regional Drama",
      category: "ticketing" as const,
      categoryLabel: "🎟️ 售票展演",
      description: "深耕台灣藝文界數十年，涵蓋兩廳院、衛武營、台中國家歌劇院之歌仔戲、國樂、現代舞與兒童劇。",
      descriptionEn: "ERA ticketing system for classical orchestra concerts, contemporary dance, opera, and traditional Taiwanese arts.",
      imageUrl: "https://ticket.com.tw/images/logo.png",
      masterUnit: "年代售票 ERA Ticket",
      startDate: "2026/01/01",
      endDate: "2026/12/31",
      url: "https://ticket.com.tw/application/utk01/utk0101_.aspx",
      location: "國家兩廳院、衛武營國家藝術文化中心、臺中國家歌劇院",
      city: "臺北市",
    },
  ];

  for (const p of platforms) {
    events.push({
      uid: p.uid,
      title: p.title,
      titleEn: p.titleEn,
      category: p.category,
      categoryLabel: p.categoryLabel,
      description: p.description,
      descriptionEn: p.descriptionEn,
      imageUrl: p.imageUrl,
      masterUnit: p.masterUnit,
      startDate: p.startDate,
      endDate: p.endDate,
      sourceWebPromote: p.url,
      webSales: p.url,
      location: p.location,
      city: p.city,
    });
  }

  return events;
}

export async function runIngestExternalEvents(): Promise<IngestExternalEventsResult> {
  const [yahooProjects, lecoinProjects, igivingProjects, npostEvents, platformEvents] =
    await Promise.all([
      scrapeYahooProjects(),
      scrapeLecoinProjects(),
      scrapeIgivingProjects(),
      scrapeNpostEvents(),
      scrapeAccupassAndPlatforms(),
    ]);

  const allEvents: NormalizedEvent[] = [
    ...yahooProjects,
    ...lecoinProjects,
    ...igivingProjects,
    ...npostEvents,
    ...platformEvents,
  ];

  let totalUpserted = 0;

  await withConnection(async (conn) => {
    for (const ev of allEvents) {
      // Upsert into cultural_events
      const [insertRes] = await conn.query<ResultSetHeader>(
        `INSERT INTO cultural_events (
          uid, title, title_en, category, category_label, description, description_en,
          image_url, master_unit, start_date, end_date, source_web_promote, web_sales,
          extra_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          title_en = VALUES(title_en),
          category = VALUES(category),
          category_label = VALUES(category_label),
          description = VALUES(description),
          description_en = VALUES(description_en),
          image_url = COALESCE(VALUES(image_url), image_url),
          master_unit = VALUES(master_unit),
          start_date = VALUES(start_date),
          end_date = VALUES(end_date),
          source_web_promote = VALUES(source_web_promote),
          web_sales = VALUES(web_sales),
          updated_at = NOW()`,
        [
          ev.uid,
          ev.title,
          ev.titleEn || null,
          ev.category,
          ev.categoryLabel,
          ev.description,
          ev.descriptionEn || null,
          ev.imageUrl || null,
          ev.masterUnit || null,
          ev.startDate,
          ev.endDate,
          ev.sourceWebPromote || null,
          ev.webSales || null,
          JSON.stringify({ source: "external_ticketing_and_charity" }),
        ],
      );

      // Get event id
      const [row] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM cultural_events WHERE uid = ?`,
        [ev.uid],
      );
      const eventId = row[0]?.id;

      if (eventId) {
        // Ensure show entry
        const [existingShow] = await conn.query<RowDataPacket[]>(
          `SELECT id FROM cultural_event_shows WHERE event_id = ? LIMIT 1`,
          [eventId],
        );
        if (existingShow.length === 0) {
          await conn.query(
            `INSERT INTO cultural_event_shows (
              event_id, show_time, location, location_name, city, on_sales, price, end_time
            ) VALUES (?, ?, ?, ?, ?, 'Y', '詳見官網售票/募款說明', ?)`,
            [
              eventId,
              ev.startDate ? `${ev.startDate} 00:00:00` : null,
              ev.location,
              ev.masterUnit || ev.location,
              ev.city,
              ev.endDate ? `${ev.endDate} 23:59:59` : null,
            ],
          );
        }
      }

      totalUpserted++;
    }
  });

  return {
    ok: true,
    yahooCount: yahooProjects.length,
    lecoinCount: lecoinProjects.length,
    igivingCount: igivingProjects.length,
    npostCount: npostEvents.length,
    accupassCount: platformEvents.length,
    ticketingCount: platformEvents.length,
    totalUpserted,
  };
}
