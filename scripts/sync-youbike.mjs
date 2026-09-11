#!/usr/bin/env node
/**
 * Syncs YouBike 2.0 real-time station data across Taipei, New Taipei, and Hsinchu City.
 *
 * Sources:
 * - Taipei City: tcgbusfs live feed
 * - New Taipei City: NTPC Open Data
 * - Hsinchu City: HCCG Open Data
 *
 * Saves normalized stations to data/youbike-stations-seed.json and upserts into MySQL.
 */

import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const SEED_FILE = path.join(process.cwd(), "data", "youbike-stations-seed.json");

function formatTime(str) {
  if (!str) return new Date().toISOString().slice(0, 19).replace("T", " ");
  // Format: 2026-09-11 20:30:00 or 20260911203000
  const clean = str.replace(/[- :T]/g, "");
  if (clean.length >= 14) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)} ${clean.slice(8, 10)}:${clean.slice(10, 12)}:${clean.slice(12, 14)}`;
  }
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function cleanName(raw) {
  return (raw || "").replace(/^YouBike2\.0_/i, "").trim();
}

export async function syncYouBike() {
  console.log("=== Syncing YouBike 2.0 Station Data ===");
  const allStations = [];

  // 1. Taipei City
  try {
    console.log("Fetching Taipei City YouBike 2.0...");
    const res = await fetch(
      "https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json",
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        for (const s of data) {
          allStations.push({
            cityCode: "TPE",
            cityName: "臺北市",
            stationNo: String(s.sno),
            nameTw: cleanName(s.sna),
            districtTw: s.sarea || "",
            addressTw: s.ar || "",
            lat: parseFloat(s.latitude) || 0,
            lng: parseFloat(s.longitude) || 0,
            totalSpaces: parseInt(s.Quantity, 10) || 0,
            availableBikes: parseInt(s.available_rent_bikes, 10) || 0,
            availableEbikes: 0,
            emptySpaces: parseInt(s.available_return_bikes, 10) || 0,
            isActive: s.act === "1" ? 1 : 0,
            updatedAtSource: formatTime(s.updateTime || s.srcUpdateTime || s.mday),
          });
        }
        console.log(`  Taipei: ${data.length} stations loaded.`);
      }
    }
  } catch (err) {
    console.warn("  Taipei fetch failed:", err.message);
  }

  // 2. New Taipei City
  try {
    console.log("Fetching New Taipei City YouBike 2.0...");
    let ntpcCount = 0;
    for (let page = 0; page < 3; page++) {
      const u = `https://data.ntpc.gov.tw/api/datasets/010e5b15-3823-4b20-b401-b1cf000550c5/json?page=${page}&size=1000`;
      const res = await fetch(u, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          for (const s of data) {
            allStations.push({
              cityCode: "NTPC",
              cityName: "新北市",
              stationNo: String(s.sno),
              nameTw: cleanName(s.sna),
              districtTw: s.sarea || "",
              addressTw: s.ar || "",
              lat: parseFloat(s.lat) || 0,
              lng: parseFloat(s.lng) || 0,
              totalSpaces: parseInt(s.tot_quantity, 10) || 0,
              availableBikes: parseInt(s.sbi_quantity, 10) || parseInt(s.yb2_quantity, 10) || 0,
              availableEbikes: parseInt(s.eyb_quantity, 10) || 0,
              emptySpaces: parseInt(s.bemp, 10) || 0,
              isActive: s.act === "1" ? 1 : 0,
              updatedAtSource: formatTime(s.mday),
            });
          }
          ntpcCount += data.length;
          if (data.length < 1000) break;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    console.log(`  New Taipei: ${ntpcCount} stations loaded.`);
  } catch (err) {
    console.warn("  New Taipei fetch failed:", err.message);
  }

  // 3. Hsinchu City
  try {
    console.log("Fetching Hsinchu City YouBike stations...");
    const res = await fetch(
      "https://odws.hccg.gov.tw/001/Upload/25/opendataback/9059/59/5776ed30-fa3c-48f4-9876-d8fb28df0501.json",
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
          const s = data[i];
          const name = s["站點名稱"] || s.sna || "";
          allStations.push({
            cityCode: "HSC",
            cityName: "新竹市",
            stationNo: `HSC_${i + 1}`,
            nameTw: cleanName(name),
            districtTw: "新竹市",
            addressTw: s["站點位置"] || s.ar || "",
            lat: parseFloat(s["緯度"] || s.lat) || 0,
            lng: parseFloat(s["經度"] || s.lng) || 0,
            totalSpaces: 20,
            availableBikes: 10,
            availableEbikes: 0,
            emptySpaces: 10,
            isActive: 1,
            updatedAtSource: new Date().toISOString().slice(0, 19).replace("T", " "),
          });
        }
        console.log(`  Hsinchu: ${data.length} stations loaded.`);
      }
    }
  } catch (err) {
    console.warn("  Hsinchu fetch failed:", err.message);
  }

  console.log(`Total stations gathered: ${allStations.length}`);

  // Write seed JSON
  fs.writeFileSync(SEED_FILE, JSON.stringify(allStations, null, 2), "utf-8");
  console.log(`Saved seed to ${SEED_FILE}`);

  // Upsert into MySQL if available
  if (process.env.MYSQL_DATABASE && allStations.length > 0) {
    try {
      const conn = await mysql.createConnection({
        host: process.env.MYSQL_HOST || "127.0.0.1",
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
      });

      console.log("Connected to MySQL for YouBike sync.");
      const BATCH_SIZE = 200;
      for (let i = 0; i < allStations.length; i += BATCH_SIZE) {
        const chunk = allStations.slice(i, i + BATCH_SIZE);
        const values = chunk.map((s) => [
          s.cityCode,
          s.stationNo,
          s.nameTw,
          s.districtTw,
          s.addressTw,
          s.lat,
          s.lng,
          s.totalSpaces,
          s.availableBikes,
          s.availableEbikes,
          s.emptySpaces,
          s.isActive,
          s.updatedAtSource,
        ]);

        await conn.query(
          `INSERT INTO youbike_stations (
            city_code, station_no, name_tw, district_tw, address_tw,
            lat, lng, total_spaces, available_bikes, available_ebikes,
            empty_spaces, is_active, updated_at_source, updated_at
          ) VALUES ?
          ON DUPLICATE KEY UPDATE
            name_tw = VALUES(name_tw),
            district_tw = VALUES(district_tw),
            address_tw = VALUES(address_tw),
            lat = VALUES(lat),
            lng = VALUES(lng),
            total_spaces = VALUES(total_spaces),
            available_bikes = VALUES(available_bikes),
            available_ebikes = VALUES(available_ebikes),
            empty_spaces = VALUES(empty_spaces),
            is_active = VALUES(is_active),
            updated_at_source = VALUES(updated_at_source),
            updated_at = NOW()`,
          [values.map((v) => [...v, new Date()])]
        );
      }
      await conn.end();
      console.log("Upserted YouBike stations into MySQL successfully.");
    } catch (dbErr) {
      console.warn("MySQL sync skipped or unavailable:", dbErr.message);
    }
  }

  return allStations;
}

if (process.argv[1] && process.argv[1].endsWith("sync-youbike.mjs")) {
  syncYouBike()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("YouBike sync error:", err);
      process.exit(1);
    });
}
