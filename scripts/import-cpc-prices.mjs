import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { XMLParser } from "fast-xml-parser";

const URLS = {
  mainProd: "https://vipmbr.cpc.com.tw/openData/MainProdListPrice",
  naturalGas: "https://vipmbr.cpc.com.tw/openData/NaturalGasListPrice",
  fuelOil: "https://vipmbr.cpc.com.tw/openData/FuelOilListPrice",
  liquor: "https://vipmbr.cpc.com.tw/CPCSTN/ListPriceWebService_Liquor.asmx/getCPCLiquorListPrice_XML",
  lpg: "https://vipmbr.cpc.com.tw/openData/LPGListPrice",
  marine: "https://vipmbr.cpc.com.tw/openData/MarineFuelListPrice",
  aviation: "https://vipmbr.cpc.com.tw/openData/AviationFuelListPrice",
  sixtype: "https://vipmbr.cpc.com.tw/openData/SixtypeOilListPrice",
  lngCost: "https://www3.cpc.com.tw/opendata_l00/%E6%B6%B2%E5%8C%96%E5%A4%A9%E7%84%B6%E6%B0%A3%E6%B0%A3%E6%BA%90%E6%88%90%E6%9C%AC.csv",
};

export function formatMinguoDate(str) {
  if (!str) return "";
  const cleaned = String(str).trim();
  if (/^\d{7}$/.test(cleaned)) {
    const y = parseInt(cleaned.slice(0, 3), 10) + 1911;
    const m = cleaned.slice(3, 5);
    const d = cleaned.slice(5, 7);
    return `${y}-${m}-${d}`;
  }
  if (/^\d{6}$/.test(cleaned)) {
    const y = parseInt(cleaned.slice(0, 2), 10) + 1911;
    const m = cleaned.slice(2, 4);
    const d = cleaned.slice(4, 6);
    return `${y}-${m}-${d}`;
  }
  if (/^\d{5}$/.test(cleaned)) {
    const y = parseInt(cleaned.slice(0, 3), 10) + 1911;
    const m = cleaned.slice(3, 5);
    return `${y}-${m}`;
  }
  return cleaned;
}

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "*/*",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(id);
  }
}

function normalizeItem(raw, defaultCategory = "") {
  const category = (raw["型別名稱"] || defaultCategory || "").trim();
  const productCode = (raw["產品編號"] || "").trim();
  const productName = (raw["產品名稱"] || "").trim();
  const packageType = (raw["包裝"] || "").trim();
  const targetCustomer = (raw["銷售對象"] || "").trim();
  const deliveryPoint = (raw["交貨地點"] || "").trim();
  const unit = (raw["計價單位"] || "").trim();
  const priceNum = parseFloat(raw["參考牌價_金額"] || 0);
  const taxDesc = (raw["營業稅_稅捐"] || "").toString().trim();
  const goodsTax = (raw["貨物稅"] || "").toString().trim();
  const rawDate = (raw["牌價生效日期"] || "").toString().trim();
  const remark = (raw["備註"] || "").trim();

  return {
    category,
    productCode,
    productName,
    packageType,
    targetCustomer,
    deliveryPoint,
    unit,
    price: isNaN(priceNum) ? 0 : priceNum,
    taxDesc,
    goodsTax,
    effectiveDate: rawDate,
    effectiveDateFormatted: formatMinguoDate(rawDate),
    remark,
  };
}

async function main() {
  console.log("開始抓取台灣中油 9 大牌價與成本資料...");
  const allItems = [];
  const errors = [];

  // 1. MainProdListPrice (汽柴油與主要牌價)
  try {
    console.log("-> 抓取主要產品牌價 (MainProdListPrice)...");
    const text = await fetchWithTimeout(URLS.mainProd);
    const list = JSON.parse(text);
    for (const row of list) {
      allItems.push(normalizeItem(row, "汽柴油零售"));
    }
  } catch (err) {
    console.error("抓取 MainProdListPrice 失敗:", err.message);
    errors.push({ source: "mainProd", error: err.message });
  }

  // 2. NaturalGasListPrice (天然氣)
  try {
    console.log("-> 抓取天然氣牌價 (NaturalGasListPrice)...");
    const text = await fetchWithTimeout(URLS.naturalGas);
    const list = JSON.parse(text);
    for (const row of list) {
      allItems.push(normalizeItem(row, "天然氣"));
    }
  } catch (err) {
    console.error("抓取 NaturalGasListPrice 失敗:", err.message);
    errors.push({ source: "naturalGas", error: err.message });
  }

  // 3. FuelOilListPrice (燃料油)
  try {
    console.log("-> 抓取燃料油牌價 (FuelOilListPrice)...");
    const text = await fetchWithTimeout(URLS.fuelOil);
    const list = JSON.parse(text);
    for (const row of list) {
      allItems.push(normalizeItem(row, "燃料油"));
    }
  } catch (err) {
    console.error("抓取 FuelOilListPrice 失敗:", err.message);
    errors.push({ source: "fuelOil", error: err.message });
  }

  // 4. Liquor (中油生技與酒類 XML)
  try {
    console.log("-> 抓取中油生技/酒類牌價 (Liquor XML)...");
    const text = await fetchWithTimeout(URLS.liquor);
    const parser = new XMLParser();
    const parsed = parser.parse(text);
    const rawTables = parsed?.Dataset?.Table || [];
    const list = Array.isArray(rawTables) ? rawTables : [rawTables];
    for (const row of list) {
      if (row && typeof row === "object") {
        allItems.push(normalizeItem(row, "中油生技/酒類"));
      }
    }
  } catch (err) {
    console.error("抓取 Liquor XML 失敗:", err.message);
    errors.push({ source: "liquor", error: err.message });
  }

  // 5. LPGListPrice (液化石油氣)
  try {
    console.log("-> 抓取液化石油氣牌價 (LPGListPrice)...");
    const text = await fetchWithTimeout(URLS.lpg);
    const list = JSON.parse(text);
    for (const row of list) {
      allItems.push(normalizeItem(row, "液化石油氣"));
    }
  } catch (err) {
    console.error("抓取 LPGListPrice 失敗:", err.message);
    errors.push({ source: "lpg", error: err.message });
  }

  // 6. MarineFuelListPrice (海運用油)
  try {
    console.log("-> 抓取海運用油牌價 (MarineFuelListPrice)...");
    const text = await fetchWithTimeout(URLS.marine);
    const list = JSON.parse(text);
    for (const row of list) {
      allItems.push(normalizeItem(row, "海運用油"));
    }
  } catch (err) {
    console.error("抓取 MarineFuelListPrice 失敗:", err.message);
    errors.push({ source: "marine", error: err.message });
  }

  // 7. AviationFuelListPrice (航空燃油)
  try {
    console.log("-> 抓取航空燃油牌價 (AviationFuelListPrice)...");
    const text = await fetchWithTimeout(URLS.aviation);
    const list = JSON.parse(text);
    for (const row of list) {
      allItems.push(normalizeItem(row, "航空燃油"));
    }
  } catch (err) {
    console.error("抓取 AviationFuelListPrice 失敗:", err.message);
    errors.push({ source: "aviation", error: err.message });
  }

  // 8. SixtypeOilListPrice (六大類油品)
  try {
    console.log("-> 抓取六大類油品牌價 (SixtypeOilListPrice)...");
    const text = await fetchWithTimeout(URLS.sixtype);
    const list = JSON.parse(text);
    for (const row of list) {
      allItems.push(normalizeItem(row, "六大類油品"));
    }
  } catch (err) {
    console.error("抓取 SixtypeOilListPrice 失敗:", err.message);
    errors.push({ source: "sixtype", error: err.message });
  }

  // 9. LNG Cost (液化天然氣氣源成本 CSV)
  try {
    console.log("-> 抓取液化天然氣氣源成本 CSV...");
    const text = await fetchWithTimeout(URLS.lngCost);
    const cleanText = text.replace(/^\uFEFF/, "");
    const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    // Header: 項次,年月,氣源成本金額元-浮點數(新台幣),單位,備註
    if (lines.length > 1) {
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",");
        if (parts.length >= 4) {
          const ym = parts[1]?.trim();
          const costVal = parseFloat(parts[2]?.trim() || 0);
          const unitVal = parts[3]?.trim() || "元/立方公尺";
          const remarkVal = parts.slice(4).join(",")?.trim() || "";
          allItems.push({
            category: "液化天然氣氣源成本",
            productCode: ym,
            productName: `液化天然氣氣源成本 (${formatMinguoDate(ym)})`,
            packageType: "管道/船運",
            targetCustomer: "台電與一般用氣用戶",
            deliveryPoint: "全台各天然氣接收站",
            unit: unitVal,
            price: isNaN(costVal) ? 0 : costVal,
            taxDesc: "0",
            goodsTax: "",
            effectiveDate: ym,
            effectiveDateFormatted: formatMinguoDate(ym),
            remark: remarkVal,
          });
        }
      }
    }
  } catch (err) {
    console.error("抓取 LNG 氣源成本 CSV 失敗:", err.message);
    errors.push({ source: "lngCost", error: err.message });
  }

  console.log(`總共解析取得 ${allItems.length} 筆油氣牌價與成本紀錄。`);

  // Write to data/cpc-prices-seed.json
  const outPath = path.resolve(process.cwd(), "data/cpc-prices-seed.json");
  const payload = {
    updatedAt: new Date().toISOString(),
    total: allItems.length,
    items: allItems,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`已成功寫入備援種子檔案: ${outPath}`);

  // DB Sync if available
  try {
    const mysqlModule = await import("../lib/server/db/mysql.ts");
    if (mysqlModule?.withConnection) {
      await mysqlModule.withConnection(async (conn) => {
        console.log("寫入 MySQL 資料庫 cpc_prices 表...");
        const now = new Date();
        let upsertedCount = 0;
        for (const item of allItems) {
          const hashInput = `${item.category}|${item.productCode}|${item.productName}|${item.packageType}|${item.price}|${item.effectiveDate}`;
          const hash = crypto.createHash("sha256").update(hashInput).digest("hex");
          await conn.query(
            `INSERT INTO cpc_prices (
              category, product_code, product_name, package_type, target_customer,
              delivery_point, unit, price, tax_desc, goods_tax, effective_date,
              remark, payload_hash, synced_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              price = VALUES(price),
              unit = VALUES(unit),
              tax_desc = VALUES(tax_desc),
              goods_tax = VALUES(goods_tax),
              remark = VALUES(remark),
              payload_hash = VALUES(payload_hash),
              synced_at = VALUES(synced_at),
              updated_at = VALUES(updated_at)`,
            [
              item.category,
              item.productCode || null,
              item.productName,
              item.packageType || null,
              item.targetCustomer || null,
              item.deliveryPoint || null,
              item.unit,
              item.price,
              item.taxDesc || null,
              item.goodsTax || null,
              item.effectiveDate || null,
              item.remark || null,
              hash,
              now,
              now,
              now,
            ]
          );
          upsertedCount++;
        }
        console.log(`成功同步 ${upsertedCount} 筆牌價紀錄至資料庫！`);
      });
    }
  } catch (dbErr) {
    console.warn("資料庫寫入略過（連線或環境未就緒）:", dbErr.message);
  }

  if (errors.length > 0) {
    console.warn(`同步完成但有 ${errors.length} 個來源異常:`, errors);
  } else {
    console.log("所有 9 個牌價與氣源成本來源皆順利抓取與儲存完畢！");
  }
}

main().catch((err) => {
  console.error("執行 import-cpc-prices 發生未捕捉錯誤:", err);
  process.exit(1);
});
