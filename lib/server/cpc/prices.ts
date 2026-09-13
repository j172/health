import fs from "node:fs";
import path from "node:path";
import { withConnection } from "@/lib/server/db/mysql";
import seedData from "@/data/cpc-prices-seed.json";

export interface CpcPriceItem {
  id?: number;
  category: string;
  productCode: string | null;
  productName: string;
  packageType: string | null;
  targetCustomer: string | null;
  deliveryPoint: string | null;
  unit: string;
  price: number;
  taxDesc: string | null;
  goodsTax: string | null;
  effectiveDate: string | null;
  effectiveDateFormatted: string;
  remark: string | null;
}

export interface CpcPriceSummaryItem {
  name: string;
  code: string;
  price: number;
  unit: string;
  effectiveDate: string;
}

export interface CpcPriceSummary {
  effectiveDate: string;
  updatedAt: string;
  gasoline: {
    unleaded98: CpcPriceSummaryItem | null;
    unleaded95: CpcPriceSummaryItem | null;
    unleaded92: CpcPriceSummaryItem | null;
    diesel: CpcPriceSummaryItem | null;
  };
  naturalGas: {
    ng1: CpcPriceSummaryItem | null;
    ng2: CpcPriceSummaryItem | null;
  };
}

export function formatMinguoDate(str?: string | null): string {
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

export async function getCpcPrices(category?: string): Promise<{
  items: CpcPriceItem[];
  categories: string[];
  total: number;
  updatedAt: string;
}> {
  // Try reading from MySQL first
  try {
    const dbResult = await withConnection(async (conn) => {
      let query = `
        SELECT id, category, product_code, product_name, package_type, target_customer,
               delivery_point, unit, price, tax_desc, goods_tax, effective_date, remark,
               synced_at
        FROM cpc_prices
      `;
      const params: any[] = [];
      if (category && category !== "all") {
        query += " WHERE category = ?";
        params.push(category);
      }
      query += " ORDER BY id ASC";

      const [rows] = await conn.query<any[]>(query, params);
      if (Array.isArray(rows) && rows.length > 0) {
        const items: CpcPriceItem[] = rows.map((r) => ({
          id: r.id,
          category: r.category,
          productCode: r.product_code,
          productName: r.product_name,
          packageType: r.package_type,
          targetCustomer: r.target_customer,
          deliveryPoint: r.delivery_point,
          unit: r.unit,
          price: Number(r.price),
          taxDesc: r.tax_desc,
          goodsTax: r.goods_tax,
          effectiveDate: r.effective_date,
          effectiveDateFormatted: formatMinguoDate(r.effective_date),
          remark: r.remark,
        }));

        const catRows = await conn.query<any[]>("SELECT DISTINCT category FROM cpc_prices ORDER BY category ASC");
        const cats = Array.isArray(catRows[0]) ? catRows[0].map((c: any) => c.category) : [];

        return {
          items,
          categories: cats,
          total: items.length,
          updatedAt: rows[0]?.synced_at ? new Date(rows[0].synced_at).toISOString() : new Date().toISOString(),
        };
      }
      return null;
    });

    if (dbResult) return dbResult;
  } catch (err) {
    // Fall back to seed
  }

  // Fallback to static seed
  let items = (seedData.items || []) as CpcPriceItem[];
  const allCategories = Array.from(new Set(items.map((i) => i.category))).sort();

  if (category && category !== "all") {
    items = items.filter((i) => i.category === category);
  }

  return {
    items,
    categories: allCategories,
    total: items.length,
    updatedAt: seedData.updatedAt || new Date().toISOString(),
  };
}

export async function getCpcPriceSummary(): Promise<CpcPriceSummary> {
  const { items, updatedAt } = await getCpcPrices();

  // Find 98, 95, 92, diesel in retail fuel category
  const retailItems = items.filter((i) => i.category.includes("汽柴油") || i.category.includes("零售"));
  const ngItems = items.filter((i) => i.category.includes("天然氣"));

  const findItem = (list: CpcPriceItem[], keyword: string): CpcPriceSummaryItem | null => {
    const found = list.find((i) => i.productName.includes(keyword) && i.targetCustomer?.includes("一般"));
    const target = found || list.find((i) => i.productName.includes(keyword));
    if (!target) return null;
    return {
      name: target.productName,
      code: target.productCode || "",
      price: target.price,
      unit: target.unit || "元/公升",
      effectiveDate: target.effectiveDateFormatted || target.effectiveDate || "",
    };
  };

  const unleaded98 = findItem(retailItems, "98無鉛");
  const unleaded95 = findItem(retailItems, "95無鉛");
  const unleaded92 = findItem(retailItems, "92無鉛");
  const diesel = findItem(retailItems, "超級柴油");

  const ng1 = findItem(ngItems, "天然氣（1）") || findItem(ngItems, "天然氣(1)");
  const ng2 = findItem(ngItems, "天然氣（2）") || findItem(ngItems, "天然氣(2)");

  const effectiveDate =
    unleaded95?.effectiveDate || unleaded92?.effectiveDate || formatMinguoDate(retailItems[0]?.effectiveDate);

  return {
    effectiveDate,
    updatedAt,
    gasoline: {
      unleaded98,
      unleaded95,
      unleaded92,
      diesel,
    },
    naturalGas: {
      ng1,
      ng2,
    },
  };
}
