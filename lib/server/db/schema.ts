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
      KEY idx_news_last_seen (last_seen_at_utc)
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
      pixabay_id BIGINT NOT NULL,
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
      KEY idx_aqi_reading_recorded (recorded_at)
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
};