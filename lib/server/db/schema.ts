export const TABLE_DDL = {
  newsItems: `
    CREATE TABLE IF NOT EXISTS news_items (
      id BIGINT NOT NULL AUTO_INCREMENT,
      source_name VARCHAR(50) NOT NULL,
      feed_code VARCHAR(10) NOT NULL,
      feed_name VARCHAR(100) NOT NULL,
      external_id VARCHAR(100) NOT NULL,
      canonical_url VARCHAR(1000) NOT NULL,
      source_url VARCHAR(1000) NOT NULL,
      title TEXT NOT NULL,
      description_html LONGTEXT NULL,
      description_text LONGTEXT NULL,
      detail_html LONGTEXT NULL,
      detail_text LONGTEXT NULL,
      dept_name VARCHAR(255) NULL,
      category_raw VARCHAR(255) NULL,
      display_type VARCHAR(50) NULL,
      meta_title VARCHAR(255) NULL,
      meta_description VARCHAR(500) NULL,
      keywords VARCHAR(500) NULL,
      geo_summary TEXT NULL,
      lat DECIMAL(10,7) NULL,
      lng DECIMAL(10,7) NULL,
      location_name VARCHAR(255) NULL,
      facility_id BIGINT NULL,
      geocode_attempts INT UNSIGNED NOT NULL DEFAULT 0,
      published_at_utc DATETIME NULL,
      public_begin_at_taipei DATETIME NULL,
      public_end_at_taipei DATETIME NULL,
      payload_hash CHAR(64) NOT NULL,
      first_seen_at_utc DATETIME NOT NULL,
      last_seen_at_utc DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_news_external (source_name, feed_code, external_id),
      UNIQUE KEY uq_news_url (source_name, canonical_url(255)),
      KEY idx_news_feed_published (feed_code, published_at_utc),
      KEY idx_news_dept_published (dept_name, published_at_utc),
      KEY idx_news_last_seen (last_seen_at_utc),
      KEY idx_news_geo (lat, lng),
      KEY idx_news_facility (facility_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  newsAssets: `
    CREATE TABLE IF NOT EXISTS news_assets (
      id BIGINT NOT NULL AUTO_INCREMENT,
      news_item_id BIGINT NOT NULL,
      asset_type VARCHAR(20) NOT NULL,
      title VARCHAR(500) NULL,
      url VARCHAR(1000) NOT NULL,
      sort_order INT NOT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_asset_unique (news_item_id, asset_type, url(255)),
      KEY idx_asset_news_item (news_item_id),
      CONSTRAINT fk_asset_news_item FOREIGN KEY (news_item_id)
        REFERENCES news_items(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  newsCardImages: `
    CREATE TABLE IF NOT EXISTS news_card_images (
      id BIGINT NOT NULL AUTO_INCREMENT,
      news_item_id BIGINT NOT NULL,
      provider VARCHAR(30) NOT NULL DEFAULT 'pixabay',
      provider_image_id VARCHAR(64) NULL,
      pixabay_id BIGINT NULL,
      local_path VARCHAR(500) NOT NULL,
      source_page_url VARCHAR(1000) NOT NULL,
      contributor_name VARCHAR(255) NULL,
      content_sha256 CHAR(64) NOT NULL,
      width INT NOT NULL,
      height INT NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_card_image_news (news_item_id),
      UNIQUE KEY uq_card_image_pixabay (pixabay_id),
      UNIQUE KEY uq_card_image_hash (content_sha256),
      UNIQUE KEY uq_card_image_path (local_path),
      CONSTRAINT fk_card_image_news_item FOREIGN KEY (news_item_id)
        REFERENCES news_items(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  pixabayApiCache: `
    CREATE TABLE IF NOT EXISTS pixabay_api_cache (
      cache_key VARCHAR(100) NOT NULL,
      response_json LONGTEXT NOT NULL,
      fetched_at_utc DATETIME NOT NULL,
      PRIMARY KEY (cache_key),
      KEY idx_pixabay_cache_fetched (fetched_at_utc)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // Search-result cache for the Pexels/Unsplash fallback providers — same
  // "cache the raw API response, re-fetch once the TTL expires" pattern as
  // pixabay_api_cache above, generalized across providers (cache_key is
  // provider-prefixed, e.g. "pexels-health-v1-...", "unsplash-health-v1-...")
  // rather than duplicated as two more single-provider tables. Pixabay keeps
  // using its own existing table unchanged — no reason to touch a working
  // path during an incident-response fix. See lib/server/news/imageProviders.ts.
  providerApiCache: `
    CREATE TABLE IF NOT EXISTS provider_api_cache (
      cache_key VARCHAR(150) NOT NULL,
      response_json LONGTEXT NOT NULL,
      fetched_at_utc DATETIME NOT NULL,
      PRIMARY KEY (cache_key),
      KEY idx_provider_cache_fetched (fetched_at_utc)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // DB-backed escalating backoff per image provider (see
  // docs/specs/news-card-image-multi-provider-fallback.md section 2) — must
  // be DB-backed rather than in-memory because the in-app cron process
  // restarts on every deploy, which would otherwise silently reset a
  // still-cooling-down provider right back to zero. One row per provider,
  // upserted lazily on first use (no pre-seeding needed).
  imageProviderCooldown: `
    CREATE TABLE IF NOT EXISTS image_provider_cooldown (
      provider VARCHAR(20) NOT NULL,
      consecutive_rate_limits INT UNSIGNED NOT NULL DEFAULT 0,
      cooldown_until DATETIME NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (provider)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // Persistent, account-level daily budget + circuit breaker for the
  // facility-geocoding batch job (see docs/specs/phase9-opencage-geocode-batch.md
  // and lib/server/facilities/geocodeBudget.ts). OpenCage's and Nominatim's
  // rate limits are per API-key/IP, not per facility source, so all 16
  // facility sources share one row per provider per day rather than each
  // getting an independent counter. DB-backed for the same reason as
  // image_provider_cooldown above: the in-app cron process restarts on every
  // deploy, and an in-memory counter would silently forget how much of
  // today's budget is already spent.
  geocodeProviderBudget: `
    CREATE TABLE IF NOT EXISTS geocode_provider_budget (
      provider VARCHAR(20) NOT NULL,
      budget_date DATE NOT NULL,
      requests_used INT UNSIGNED NOT NULL DEFAULT 0,
      circuit_broken TINYINT(1) NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (provider, budget_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // One-time-action markers for the geocode batch job — currently just the
  // single controlled geocode_attempts reset called for in the spec ("never
  // reset on every scheduled run"). A generic flag_key/flag_value shape
  // rather than a single boolean column so any future one-time action can
  // reuse this table instead of another migration.
  geocodeBackfillFlags: `
    CREATE TABLE IF NOT EXISTS geocode_backfill_flags (
      flag_key VARCHAR(64) NOT NULL,
      flag_value TINYINT(1) NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (flag_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  ingestRuns: `
    CREATE TABLE IF NOT EXISTS ingest_runs (
      id BIGINT NOT NULL AUTO_INCREMENT,
      trigger_type VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL,
      started_at DATETIME NOT NULL,
      ended_at DATETIME NULL,
      duration_ms INT NULL,
      fetched_count INT NOT NULL DEFAULT 0,
      inserted_count INT NOT NULL DEFAULT 0,
      updated_count INT NOT NULL DEFAULT 0,
      unchanged_count INT NOT NULL DEFAULT 0,
      failed_feeds_count INT NOT NULL DEFAULT 0,
      summary_json JSON NULL,
      error_message TEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_ingest_started (started_at),
      KEY idx_ingest_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  facilities: `
    CREATE TABLE IF NOT EXISTS facilities (
      id BIGINT NOT NULL AUTO_INCREMENT,
      facility_type VARCHAR(40) NOT NULL,
      source_key VARCHAR(40) NOT NULL,
      source_id VARCHAR(100) NOT NULL,
      name VARCHAR(255) NOT NULL,
      address VARCHAR(500) NULL,
      phone VARCHAR(100) NULL,
      lat DECIMAL(10,7) NULL,
      lng DECIMAL(10,7) NULL,
      service_item VARCHAR(255) NULL,
      service_time VARCHAR(255) NULL,
      data_org VARCHAR(255) NULL,
      extra_json JSON NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_facility_source (source_key, source_id),
      KEY idx_facility_type (facility_type),
      KEY idx_facility_geo (lat, lng)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  drugs: `
    CREATE TABLE IF NOT EXISTS drugs (
      id BIGINT NOT NULL AUTO_INCREMENT,
      source_key VARCHAR(40) NOT NULL,
      license_no VARCHAR(50) NOT NULL,
      name_zh VARCHAR(255) NOT NULL,
      name_en VARCHAR(255) NULL,
      shape VARCHAR(100) NULL,
      dosage_form VARCHAR(100) NULL,
      color VARCHAR(100) NULL,
      odor VARCHAR(100) NULL,
      score_mark VARCHAR(100) NULL,
      size_mm VARCHAR(50) NULL,
      imprint_1 VARCHAR(100) NULL,
      imprint_2 VARCHAR(100) NULL,
      image_url VARCHAR(500) NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_drug_license (license_no),
      KEY idx_drug_name_zh (name_zh(50)),
      KEY idx_drug_name_en (name_en(50))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // TFDA 藥品成分資料庫 (data.fda.gov.tw export/43) — one row per (license ×
  // ingredient). No clean natural key: the same (license_no, ingredient_code)
  // pair can legitimately repeat with a different content_description
  // (confirmed live, e.g. a footnoted secondary concentration), so row_key is
  // a SHA-256 hash of the full raw row — same "hash the raw fields" reasoning
  // as cwa_alerts.alert_key.
  tfdaDrugIngredients: `
    CREATE TABLE IF NOT EXISTS tfda_drug_ingredients (
      id BIGINT NOT NULL AUTO_INCREMENT,
      row_key CHAR(64) NOT NULL,
      license_no VARCHAR(50) NOT NULL,
      prescription_label VARCHAR(255) NULL,
      ingredient_name VARCHAR(255) NOT NULL,
      ingredient_code VARCHAR(50) NULL,
      content_description VARCHAR(100) NULL,
      content_amount VARCHAR(50) NULL,
      content_unit VARCHAR(50) NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_drug_ingredient_row (row_key),
      KEY idx_drug_ingredient_license (license_no),
      KEY idx_drug_ingredient_name (ingredient_name(100))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  ingestErrors: `
    CREATE TABLE IF NOT EXISTS ingest_errors (
      id BIGINT NOT NULL AUTO_INCREMENT,
      ingest_run_id BIGINT NOT NULL,
      feed_code VARCHAR(10) NULL,
      url VARCHAR(1000) NULL,
      message TEXT NOT NULL,
      detail_json JSON NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_ingest_error_run (ingest_run_id),
      CONSTRAINT fk_ingest_error_run FOREIGN KEY (ingest_run_id)
        REFERENCES ingest_runs(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // 環境部 (MOENV) 全台空氣品質即時測站資料 — data.moenv.gov.tw AQX_P_432, hourly
  // cron. One row per (site, publishtime) so history accumulates over time;
  // /api/aqi reads the latest row per site. See lib/server/aqi/runSync.ts.
  aqiReadings: `
    CREATE TABLE IF NOT EXISTS aqi_readings (
      id BIGINT NOT NULL AUTO_INCREMENT,
      site_id VARCHAR(20) NOT NULL,
      site_name VARCHAR(100) NOT NULL,
      county VARCHAR(20) NOT NULL,
      lat DECIMAL(10,7) NULL,
      lng DECIMAL(10,7) NULL,
      aqi_value SMALLINT NULL,
      aqi_status VARCHAR(50) NULL,
      pm25 DECIMAL(6,1) NULL,
      pm10 DECIMAL(6,1) NULL,
      o3 DECIMAL(6,1) NULL,
      no2 DECIMAL(6,1) NULL,
      so2 DECIMAL(6,1) NULL,
      co DECIMAL(6,2) NULL,
      recorded_at DATETIME NOT NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_aqi_reading (site_id, recorded_at),
      KEY idx_aqi_reading_county (county),
      KEY idx_aqi_reading_recorded (recorded_at),
      KEY idx_aqi_reading_geo (lat, lng)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // 環境部細懸浮微粒(PM2.5)即時資料 — data.moenv.gov.tw AQX_P_02, same ~79-
  // station network as aqi_readings but its own dataset/API key, 30-minute
  // cron alongside aqi-sync. The source payload has no lat/lng of its own,
  // so it's resolved by matching (site_name, county) against aqi_readings at
  // upsert time and stored here directly for fast nearest-station lookups.
  pm25Readings: `
    CREATE TABLE IF NOT EXISTS pm25_readings (
      id BIGINT NOT NULL AUTO_INCREMENT,
      site_name VARCHAR(100) NOT NULL,
      county VARCHAR(20) NOT NULL,
      lat DECIMAL(10,7) NULL,
      lng DECIMAL(10,7) NULL,
      pm25 DECIMAL(6,1) NULL,
      recorded_at DATETIME NOT NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_pm25_reading (site_name, recorded_at),
      KEY idx_pm25_reading_geo (lat, lng)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // 環境部空氣品質預測 — data.moenv.gov.tw AQF_P_01, 30-minute cron. Keyed by
  // (zone, forecast_date) — zone is one of MOENV's 10 空品區 groupings (北部/
  // 竹苗/中部/雲嘉南/高屏/宜蘭/花東/澎湖/金門/馬祖), not an individual
  // station, so nearest-user lookups resolve zone via the nearest AQI
  // station's county (see lib/server/aqi/forecastQueries.ts's COUNTY_TO_ZONE
  // map) rather than a lat/lng column on this table.
  aqiForecasts: `
    CREATE TABLE IF NOT EXISTS aqi_forecasts (
      id BIGINT NOT NULL AUTO_INCREMENT,
      zone VARCHAR(20) NOT NULL,
      forecast_date DATE NOT NULL,
      publish_time DATETIME NOT NULL,
      aqi_value SMALLINT NULL,
      major_pollutant VARCHAR(50) NULL,
      minor_pollutant VARCHAR(50) NULL,
      minor_pollutant_aqi VARCHAR(20) NULL,
      content TEXT NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_aqi_forecast (zone, forecast_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // 中央氣象署 (CWA) open-data ingestion — opendata.cwa.gov.tw, hourly cron.
  // See lib/server/cwa/runSync.ts for the source registry.
  cwaForecasts: `
    CREATE TABLE IF NOT EXISTS cwa_forecasts (
      id BIGINT NOT NULL AUTO_INCREMENT,
      county_name VARCHAR(20) NOT NULL,
      element_name VARCHAR(20) NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      parameter_name VARCHAR(100) NULL,
      parameter_value VARCHAR(100) NULL,
      parameter_unit VARCHAR(50) NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_cwa_forecast (county_name, element_name, start_time),
      KEY idx_cwa_forecast_county (county_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  cwaEarthquakes: `
    CREATE TABLE IF NOT EXISTS cwa_earthquakes (
      id BIGINT NOT NULL AUTO_INCREMENT,
      earthquake_no BIGINT NOT NULL,
      report_type VARCHAR(50) NULL,
      report_color VARCHAR(20) NULL,
      origin_time DATETIME NULL,
      location VARCHAR(255) NULL,
      epicenter_lat DECIMAL(10,7) NULL,
      epicenter_lng DECIMAL(10,7) NULL,
      focal_depth DECIMAL(6,2) NULL,
      magnitude_value DECIMAL(4,2) NULL,
      magnitude_type VARCHAR(20) NULL,
      max_intensity VARCHAR(20) NULL,
      report_content TEXT NULL,
      report_image_uri VARCHAR(500) NULL,
      web VARCHAR(500) NULL,
      area_intensity_json JSON NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_cwa_earthquake_no (earthquake_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  cwaTsunamis: `
    CREATE TABLE IF NOT EXISTS cwa_tsunamis (
      id BIGINT NOT NULL AUTO_INCREMENT,
      report_no VARCHAR(20) NOT NULL,
      report_type VARCHAR(50) NULL,
      report_color VARCHAR(20) NULL,
      issue_time DATETIME NULL,
      end_time DATETIME NULL,
      report_content TEXT NULL,
      web VARCHAR(500) NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_cwa_tsunami_report (report_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // CAP-format hazard alerts — shares one schema across the 4 CAP-based
  // datasets (rain/cold/heat/typhoon); dataset_id disambiguates the source.
  // CAP records carry no stable identifier field, so alert_key is a SHA-256
  // hash of (dataset_id, event, areaDesc, effective) — the same "hash the raw
  // fields, don't derive it from anything normalize()-like might change"
  // reasoning as facilities' tfda_pharmacy sourceId.
  cwaAlerts: `
    CREATE TABLE IF NOT EXISTS cwa_alerts (
      id BIGINT NOT NULL AUTO_INCREMENT,
      alert_key CHAR(64) NOT NULL,
      dataset_id VARCHAR(20) NOT NULL,
      event VARCHAR(100) NULL,
      headline VARCHAR(255) NULL,
      description TEXT NULL,
      instruction TEXT NULL,
      severity VARCHAR(50) NULL,
      urgency VARCHAR(50) NULL,
      certainty VARCHAR(50) NULL,
      area_desc VARCHAR(500) NULL,
      effective DATETIME NULL,
      onset DATETIME NULL,
      expires DATETIME NULL,
      web VARCHAR(500) NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_cwa_alert_key (alert_key),
      KEY idx_cwa_alert_dataset (dataset_id),
      KEY idx_cwa_alert_expires (expires)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  cwaTownshipHazards: `
    CREATE TABLE IF NOT EXISTS cwa_township_hazards (
      id BIGINT NOT NULL AUTO_INCREMENT,
      location_name VARCHAR(20) NOT NULL,
      geocode VARCHAR(20) NULL,
      phenomena VARCHAR(50) NOT NULL,
      significance VARCHAR(50) NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_cwa_township_hazard (location_name, phenomena, start_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // Station weather observations — shares one schema across O-A0001-001 and
  // O-A0003-001 (same station-level fields; O-A0003 additionally reports
  // visibility/sunshine), disambiguated by dataset_id.
  cwaStationWeather: `
    CREATE TABLE IF NOT EXISTS cwa_station_weather (
      id BIGINT NOT NULL AUTO_INCREMENT,
      dataset_id VARCHAR(20) NOT NULL,
      station_id VARCHAR(20) NOT NULL,
      station_name VARCHAR(100) NULL,
      county_name VARCHAR(20) NULL,
      town_name VARCHAR(20) NULL,
      lat DECIMAL(10,7) NULL,
      lng DECIMAL(10,7) NULL,
      altitude DECIMAL(8,2) NULL,
      obs_time DATETIME NOT NULL,
      weather VARCHAR(50) NULL,
      precipitation VARCHAR(20) NULL,
      wind_direction VARCHAR(20) NULL,
      wind_speed VARCHAR(20) NULL,
      air_temperature VARCHAR(20) NULL,
      relative_humidity VARCHAR(20) NULL,
      air_pressure VARCHAR(20) NULL,
      uv_index VARCHAR(20) NULL,
      peak_gust_speed VARCHAR(20) NULL,
      visibility_description VARCHAR(100) NULL,
      sunshine_duration VARCHAR(20) NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_cwa_station_weather (dataset_id, station_id, obs_time),
      KEY idx_cwa_station_weather_geo (lat, lng)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  cwaDailyRainfall: `
    CREATE TABLE IF NOT EXISTS cwa_daily_rainfall (
      id BIGINT NOT NULL AUTO_INCREMENT,
      station_id VARCHAR(20) NOT NULL,
      station_name VARCHAR(100) NULL,
      obs_date DATE NOT NULL,
      precipitation DECIMAL(8,2) NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_cwa_daily_rainfall (station_id, obs_date),
      KEY idx_cwa_daily_rainfall_date (obs_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  cwaRainfall: `
    CREATE TABLE IF NOT EXISTS cwa_rainfall (
      id BIGINT NOT NULL AUTO_INCREMENT,
      station_id VARCHAR(20) NOT NULL,
      station_name VARCHAR(100) NULL,
      county_name VARCHAR(20) NULL,
      town_name VARCHAR(20) NULL,
      lat DECIMAL(10,7) NULL,
      lng DECIMAL(10,7) NULL,
      obs_time DATETIME NOT NULL,
      precip_now VARCHAR(20) NULL,
      precip_10min VARCHAR(20) NULL,
      precip_1hr VARCHAR(20) NULL,
      precip_3hr VARCHAR(20) NULL,
      precip_6hr VARCHAR(20) NULL,
      precip_12hr VARCHAR(20) NULL,
      precip_24hr VARCHAR(20) NULL,
      precip_2days VARCHAR(20) NULL,
      precip_3days VARCHAR(20) NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_cwa_rainfall (station_id, obs_time),
      KEY idx_cwa_rainfall_geo (lat, lng)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  cwaUvIndex: `
    CREATE TABLE IF NOT EXISTS cwa_uv_index (
      id BIGINT NOT NULL AUTO_INCREMENT,
      station_id VARCHAR(20) NOT NULL,
      obs_date DATE NOT NULL,
      uv_index DECIMAL(4,1) NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_cwa_uv_index (station_id, obs_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // 全球地震 — USGS + EMSC + HKO, 5-minute cron. See lib/server/earthquakes/.
  // No single source's event ID is usable as a cross-source unique key (each
  // agency assigns its own), so there's deliberately no UNIQUE KEY here for
  // "same earthquake" — that's a fuzzy match (time/distance/magnitude
  // tolerance) done in application code (queries.ts), not the database.
  globalEarthquakes: `
    CREATE TABLE IF NOT EXISTS global_earthquakes (
      id BIGINT NOT NULL AUTO_INCREMENT,
      event_time DATETIME NOT NULL,
      magnitude DECIMAL(4,2) NULL,
      magnitude_type VARCHAR(20) NULL,
      depth_km DECIMAL(7,2) NULL,
      lat DECIMAL(10,7) NOT NULL,
      lng DECIMAL(10,7) NOT NULL,
      place VARCHAR(255) NULL,
      place_zh VARCHAR(255) NULL,
      tsunami_warning TINYINT(1) NOT NULL DEFAULT 0,
      primary_source VARCHAR(20) NOT NULL,
      sources_json JSON NULL,
      url VARCHAR(500) NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_global_eq_time (event_time),
      KEY idx_global_eq_geo (lat, lng),
      KEY idx_global_eq_magnitude (magnitude)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // TFDA 食品營養成分資料庫 (data.fda.gov.tw InfoId=20) — six-monthly sync.
  // Long/narrow source format: one row per (food sample × analysis item), so
  // 整合編號 alone isn't unique — the natural composite key is sample+category
  // +item. Numeric-looking fields are VARCHAR because the source mixes real
  // numbers with "-"/"Tr"(trace)/blank, same reasoning as cwa_station_weather's
  // air_temperature etc. Fetched/parsed on GitHub Actions (226k+ rows, too
  // large to unzip on this host) and batch-POSTed; see scripts/import-tfda-food-nutrition.mjs.
  tfdaFoodNutrition: `
    CREATE TABLE IF NOT EXISTS tfda_food_nutrition (
      id BIGINT NOT NULL AUTO_INCREMENT,
      sample_id VARCHAR(20) NOT NULL,
      food_category VARCHAR(100) NULL,
      data_category VARCHAR(50) NULL,
      sample_name VARCHAR(255) NULL,
      common_name VARCHAR(255) NULL,
      sample_name_en VARCHAR(255) NULL,
      content_description VARCHAR(500) NULL,
      waste_rate VARCHAR(50) NULL,
      nutrient_category VARCHAR(100) NOT NULL,
      nutrient_item VARCHAR(100) NOT NULL,
      unit VARCHAR(30) NULL,
      value_per_100g VARCHAR(30) NULL,
      sample_count VARCHAR(20) NULL,
      std_dev VARCHAR(30) NULL,
      value_per_unit VARCHAR(30) NULL,
      unit_weight VARCHAR(30) NULL,
      value_per_unit_weight VARCHAR(30) NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_food_nutrition (sample_id, nutrient_category, nutrient_item),
      KEY idx_food_nutrition_name (sample_name(100))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // TFDA 食品業者登錄資料 (data.fda.gov.tw export/97) — six-monthly sync.
  // Flat format, natural unique key on 食品業者登錄字號 (registration_no, e.g.
  // "N-153633460-00337-4"). ~825k rows, also fetched/parsed on GitHub Actions.
  tfdaFoodOperators: `
    CREATE TABLE IF NOT EXISTS tfda_food_operators (
      id BIGINT NOT NULL AUTO_INCREMENT,
      registration_no VARCHAR(50) NOT NULL,
      company_name VARCHAR(255) NULL,
      unified_business_no VARCHAR(20) NULL,
      address VARCHAR(500) NULL,
      registration_type VARCHAR(50) NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_food_operator_reg (registration_no),
      KEY idx_food_operator_name (company_name(100)),
      KEY idx_food_operator_unified_no (unified_business_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // Social-post draft queue (Phase 1) — see
  // docs/specs/social-icons-and-post-drafts.md section 2. Daily cron
  // (lib/server/social/buildDailyDraftQueue.ts) inserts one 'draft' row per
  // platform for each selected news item; status flips to 'posted'/'failed'
  // only once a follow-up spec wires up the actual Meta Graph/Threads API
  // calls (out of scope here).
  socialPostQueue: `
    CREATE TABLE IF NOT EXISTS social_post_queue (
      id BIGINT NOT NULL AUTO_INCREMENT,
      news_item_id BIGINT NOT NULL,
      platform VARCHAR(20) NOT NULL,       -- 'facebook' | 'instagram' | 'threads'
      caption TEXT NOT NULL,
      image_path VARCHAR(500) NOT NULL,    -- copied from news_card_images.local_path
      status VARCHAR(20) NOT NULL DEFAULT 'draft', -- 'draft' | 'posted' | 'failed'
      scheduled_at DATETIME NULL,
      posted_at DATETIME NULL,
      error_message TEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_social_queue_item_platform (news_item_id, platform),
      KEY idx_social_queue_status (status, created_at),
      CONSTRAINT fk_social_queue_news_item FOREIGN KEY (news_item_id)
        REFERENCES news_items(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // Cultural events main table (文化部藝文活動)
  culturalEvents: `
    CREATE TABLE IF NOT EXISTS cultural_events (
      id BIGINT NOT NULL AUTO_INCREMENT,
      uid VARCHAR(100) NOT NULL,
      title VARCHAR(500) NOT NULL,
      category VARCHAR(20) NOT NULL,
      category_label VARCHAR(100) NOT NULL,
      description LONGTEXT NULL,
      image_url VARCHAR(1000) NULL,
      master_unit VARCHAR(500) NULL,
      start_date VARCHAR(30) NULL,
      end_date VARCHAR(30) NULL,
      source_web_promote VARCHAR(1000) NULL,
      web_sales VARCHAR(1000) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_cultural_event_uid (uid),
      KEY idx_cultural_event_category (category),
      KEY idx_cultural_event_dates (start_date, end_date),
      KEY idx_cultural_event_updated (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // Cultural event shows sub-table (文化部藝文活動場次)
  culturalEventShows: `
    CREATE TABLE IF NOT EXISTS cultural_event_shows (
      id BIGINT NOT NULL AUTO_INCREMENT,
      event_id BIGINT NOT NULL,
      show_time VARCHAR(100) NULL,
      location VARCHAR(500) NULL,
      location_name VARCHAR(500) NULL,
      city VARCHAR(50) NULL,
      on_sales VARCHAR(20) NULL,
      price VARCHAR(500) NULL,
      lat DECIMAL(10,7) NULL,
      lng DECIMAL(10,7) NULL,
      end_time VARCHAR(100) NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_cultural_show_event (event_id),
      KEY idx_cultural_show_city (city),
      KEY idx_cultural_show_geo (lat, lng),
      CONSTRAINT fk_cultural_show_event FOREIGN KEY (event_id)
        REFERENCES cultural_events(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // Public art installations (公共藝術資料)
  publicArts: `
    CREATE TABLE IF NOT EXISTS public_arts (
      id BIGINT NOT NULL AUTO_INCREMENT,
      art_no VARCHAR(100) NOT NULL,
      title VARCHAR(500) NOT NULL,
      artist VARCHAR(500) NULL,
      dimensions VARCHAR(500) NULL,
      material VARCHAR(500) NULL,
      city VARCHAR(50) NULL,
      location VARCHAR(500) NULL,
      lat DECIMAL(10,7) NULL,
      lng DECIMAL(10,7) NULL,
      field_type VARCHAR(200) NULL,
      description LONGTEXT NULL,
      image_url VARCHAR(1000) NULL,
      year VARCHAR(50) NULL,
      source_url VARCHAR(1000) NULL,
      agency VARCHAR(500) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_public_art_no (art_no),
      KEY idx_public_art_city (city),
      KEY idx_public_art_geo (lat, lng),
      KEY idx_public_art_artist (artist(100))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // CDC travel epidemic alerts (疾管署國際旅遊疫情建議)
  cdcTravelAlerts: `
    CREATE TABLE IF NOT EXISTS cdc_travel_alerts (
      id VARCHAR(100) NOT NULL,
      alert_title VARCHAR(500) NOT NULL,
      severity_level VARCHAR(100) NOT NULL,
      level_code TINYINT NOT NULL DEFAULT 0,
      disease VARCHAR(200) NOT NULL,
      country VARCHAR(100) NOT NULL,
      country_en VARCHAR(100) NULL,
      instruction TEXT NULL,
      web VARCHAR(1000) NULL,
      lat DECIMAL(10,7) NULL,
      lng DECIMAL(10,7) NULL,
      iso VARCHAR(10) NULL,
      effective_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_cdc_alert_level (level_code),
      KEY idx_cdc_alert_country (country)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // CDC international epidemic news (疾管署國際重要疫情資訊)
  cdcEpidemicNews: `
    CREATE TABLE IF NOT EXISTS cdc_epidemic_news (
      id VARCHAR(100) NOT NULL,
      sent_at DATETIME NULL,
      effective_at DATETIME NULL,
      headline VARCHAR(500) NOT NULL,
      description LONGTEXT NULL,
      disease VARCHAR(200) NOT NULL,
      country VARCHAR(100) NOT NULL,
      country_en VARCHAR(100) NULL,
      web VARCHAR(1000) NULL,
      lat DECIMAL(10,7) NULL,
      lng DECIMAL(10,7) NULL,
      iso VARCHAR(10) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_cdc_news_sent (sent_at),
      KEY idx_cdc_news_country (country)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // Taiwan Water outages (自來水停水通知)
  waterOutages: `
    CREATE TABLE IF NOT EXISTS water_outages (
      id VARCHAR(100) NOT NULL,
      publish_time VARCHAR(100) NULL,
      start_time DATETIME NULL,
      end_time DATETIME NULL,
      outage_type VARCHAR(100) NOT NULL,
      county VARCHAR(50) NOT NULL,
      districts VARCHAR(255) NULL,
      reason TEXT NULL,
      influence_area TEXT NULL,
      supply_station VARCHAR(255) NULL,
      is_within_one_week TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_water_county (county),
      KEY idx_water_start_time (start_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
  // 環境部 (MOENV) 環保標章產品 — data.moenv.gov.tw GP_P_02
  greenProducts: `
    CREATE TABLE IF NOT EXISTS green_products (
      id BIGINT NOT NULL AUTO_INCREMENT,
      flag_no VARCHAR(50) NOT NULL,
      product_name VARCHAR(500) NOT NULL,
      class_type VARCHAR(100) NULL,
      sign_date VARCHAR(50) NULL,
      expire_date VARCHAR(50) NULL,
      date_extend_date VARCHAR(50) NULL,
      is_expire VARCHAR(10) NULL,
      synced_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_green_product_flag (flag_no),
      KEY idx_green_product_name (product_name(100)),
      KEY idx_green_product_class (class_type),
      KEY idx_green_product_sign (sign_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `,
};
