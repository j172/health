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