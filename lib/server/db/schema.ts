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
};